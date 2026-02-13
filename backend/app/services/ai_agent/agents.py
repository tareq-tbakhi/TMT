"""
CrewAI agent definitions for the TMT multi-agent system.

Agents:
  1. Risk Scorer — patient risk assessment + hospital recommendation
  2. Triage Agent — SOS classification + alert creation
  3. Intel Agent — Telegram monitoring + crisis intelligence
  4. Verify Agent — cross-referencing + channel trust management
"""
import logging

from crewai import Agent, LLM

from app.config import get_settings
from app.services.ai_agent.tools import (
    query_patient,
    query_medical_records,
    query_sos_history,
    update_risk_score,
    find_nearby_alerts,
    find_nearby_events,
    find_nearby_hospitals,
    find_nearby_facilities,
    create_alert,
    search_telegram_intel,
    fetch_telegram_messages,
    classify_and_extract_message,
    store_embedding_tool,
    find_corroboration,
    find_related_sos,
    update_channel_trust,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# LLM configuration — GLM-5 via OpenAI-compatible API
# ---------------------------------------------------------------------------

_llm = None


def get_llm() -> LLM:
    """Get or create the shared LLM instance for all agents."""
    global _llm
    if _llm is None:
        if settings.GLM_API_KEY:
            _llm = LLM(
                model="openai/glm-5",
                base_url="https://api.z.ai/api/paas/v4",
                api_key=settings.GLM_API_KEY,
                temperature=0.3,
                max_tokens=4096,
            )
        else:
            # Fallback — will cause agents to use tools only (no LLM reasoning)
            logger.warning("No LLM API key configured; agents will have limited capability")
            _llm = LLM(
                model="openai/glm-5",
                base_url="https://api.z.ai/api/paas/v4",
                api_key="placeholder",
                temperature=0.3,
                max_tokens=4096,
            )
    return _llm


# ---------------------------------------------------------------------------
# Agent 1: Risk Scorer + Hospital Recommender
# ---------------------------------------------------------------------------

def build_risk_scorer() -> Agent:
    return Agent(
        role="Patient Risk Assessment & Hospital Recommendation Specialist",
        goal=(
            "Compute an accurate 0-100 risk score for a patient based on their "
            "full medical profile, injury details, SOS history, location danger, "
            "and current context. Also recommend the best nearby hospital based on "
            "bed availability, specialties, distance, and supply levels. "
            "Provide a clear urgency assessment."
        ),
        backstory=(
            "You are a senior emergency medicine specialist with 20 years of experience "
            "in conflict-zone triage. You assess patient vulnerability by analyzing:\n"
            "- Medical conditions (diabetes, heart disease, respiratory issues increase risk)\n"
            "- Mobility (bedridden/wheelchair patients cannot self-evacuate)\n"
            "- Living situation (patients living alone have no immediate help)\n"
            "- SOS history patterns (frequent genuine SOS = chronically at risk)\n"
            "- Trust score (low trust with no corroboration = possible false alarm)\n"
            "- Injury details from the current SOS\n"
            "- Proximity to active threats (nearby bombings, fires, etc.)\n"
            "- Age (elderly patients from date of birth are more vulnerable)\n"
            "- Special equipment dependency (oxygen, dialysis = life-threatening if disrupted)\n\n"
            "For hospital recommendation, you consider:\n"
            "- Distance to patient (closest operational hospital preferred)\n"
            "- Available beds and ICU capacity\n"
            "- Hospital specialties matching the emergency type\n"
            "- Supply levels (blood, medicine)\n"
            "- Hospital operational status\n\n"
            "You MUST call the Update Risk Score tool to persist the score."
        ),
        llm=get_llm(),
        tools=[
            query_patient,
            query_medical_records,
            query_sos_history,
            find_nearby_alerts,
            find_nearby_hospitals,
            find_nearby_facilities,
            update_risk_score,
        ],
        memory=False,
        verbose=False,
    )


# ---------------------------------------------------------------------------
# Agent 2: Triage Agent
# ---------------------------------------------------------------------------

def build_triage_agent() -> Agent:
    return Agent(
        role="Emergency SOS Triage & Department Routing Coordinator",
        goal=(
            "Classify the SOS emergency type and severity, decide which department "
            "(hospital, police, or civil_defense) should handle it, find the best "
            "facility in that department, and create the alert routed to the correct "
            "department. Include the patient's risk score, recommended facility, and "
            "urgency from the risk assessment in the alert metadata."
        ),
        backstory=(
            "You are an experienced crisis coordinator operating in Palestine/Gaza. "
            "You classify emergencies by type, determine response urgency, decide "
            "which department handles the case, and dispatch alerts.\n\n"
            "DEPARTMENT ROUTING RULES — you MUST route each case to exactly one department:\n\n"
            "Route to HOSPITAL (department='hospital') for:\n"
            "- Medical emergencies: injuries, illnesses, chronic condition crises\n"
            "- Patients needing medical treatment, surgery, or ICU care\n"
            "- Mass casualty events (hospital handles medical side)\n"
            "- Ambulance dispatch needs\n"
            "- Default for unclear medical situations\n\n"
            "Route to POLICE (department='police') for:\n"
            "- Active shootings, gunfire, armed threats\n"
            "- Looting, theft, break-ins, civil unrest\n"
            "- Security threats, suspicious activities\n"
            "- Kidnapping, hostage situations\n"
            "- Crowd control, riot situations\n"
            "- Traffic incidents requiring law enforcement\n"
            "- Crime scenes that need securing\n\n"
            "Route to CIVIL DEFENSE (department='civil_defense') for:\n"
            "- Building collapses, structural failures (trapped people)\n"
            "- Fires (house fire, wildfire, industrial fire)\n"
            "- Floods, earthquakes, natural disasters\n"
            "- Chemical/hazmat spills or contamination\n"
            "- Bombing aftermath (rescue/extraction, not the attack itself)\n"
            "- Search and rescue operations\n"
            "- Shelter/evacuation coordination\n"
            "- Infrastructure damage (roads, bridges, utilities)\n\n"
            "MIXED CASES: Some cases involve multiple departments. Route to the PRIMARY "
            "responder:\n"
            "- Shooting with injuries → police (security first, hospital notified via alert)\n"
            "- Building collapse with injuries → civil_defense (rescue first)\n"
            "- Fire with burn victims → civil_defense (firefighting first)\n"
            "- Car accident with injuries → hospital (medical first)\n\n"
            "You consider:\n"
            "- The patient's risk score and level from the previous assessment\n"
            "- Nearby active threats and alert density\n"
            "- Telegram intelligence corroboration\n"
            "- The specific nature of the SOS (injured, trapped, evacuate)\n"
            "- SOS severity level (1-5)\n\n"
            "Event types: flood, bombing, earthquake, fire, building_collapse, "
            "shooting, chemical, medical_emergency, infrastructure, other.\n"
            "Severity levels: low, medium, high, critical.\n\n"
            "You MUST:\n"
            "1. Use Find Nearby Facilities to find the best facility in the target department\n"
            "2. Call the Create Alert tool with routed_department and target_facility_id set\n"
            "3. Always set routed_department to one of: hospital, police, civil_defense"
        ),
        llm=get_llm(),
        tools=[
            find_nearby_alerts,
            find_nearby_events,
            find_nearby_facilities,
            search_telegram_intel,
            create_alert,
        ],
        memory=False,
        verbose=False,
    )


# ---------------------------------------------------------------------------
# Agent 3: Intel Agent
# ---------------------------------------------------------------------------

def build_intel_agent() -> Agent:
    return Agent(
        role="Crisis Intelligence Analyst",
        goal=(
            "Monitor Telegram channels for crisis events. Fetch recent messages, "
            "classify each as crisis or non-crisis, extract structured event data "
            "from crisis messages, and store embeddings in the knowledge base. "
            "Return a summary of all findings."
        ),
        backstory=(
            "You are an OSINT analyst specializing in real-time crisis monitoring "
            "in conflict zones, particularly Palestine/Gaza. You process Telegram "
            "messages in Arabic and English, identifying active crises like bombings, "
            "fires, shootings, floods, building collapses, and medical emergencies.\n\n"
            "Your workflow:\n"
            "1. Fetch latest messages from monitored channels\n"
            "2. Classify each message — is it about an active crisis?\n"
            "3. For crisis messages: extract event type, severity, location, details\n"
            "4. Store all processed messages as embeddings for future reference\n"
            "5. Return a structured summary of findings"
        ),
        llm=get_llm(),
        tools=[
            fetch_telegram_messages,
            classify_and_extract_message,
            search_telegram_intel,
            store_embedding_tool,
        ],
        memory=False,
        verbose=False,
    )


# ---------------------------------------------------------------------------
# Agent 4: Verification Agent
# ---------------------------------------------------------------------------

def build_verify_agent() -> Agent:
    return Agent(
        role="Source Verification & Trust Analyst",
        goal=(
            "Cross-reference crisis reports against multiple sources to verify "
            "authenticity. Find corroborating events and related SOS requests. "
            "Update Telegram channel trust scores based on verification results."
        ),
        backstory=(
            "You are an intelligence verification specialist. You determine if "
            "Telegram-sourced crisis reports are genuine by:\n"
            "- Searching for corroborating events from other sources within 3km\n"
            "- Finding related SOS requests from patients in the same area\n"
            "- Analyzing timing and spatial patterns\n"
            "- Considering the reporting channel's trust history\n\n"
            "After verification, you update the channel's trust score:\n"
            "- Verified events: positive trust delta (+0.02 to +0.1)\n"
            "- Unverified with no corroboration: slight negative (-0.01 to -0.05)\n"
            "- Clearly false reports: larger negative (-0.05 to -0.1)\n"
            "- Channels with trust < 0.15 after 5+ reports get auto-blacklisted"
        ),
        llm=get_llm(),
        tools=[
            find_corroboration,
            find_related_sos,
            update_channel_trust,
            search_telegram_intel,
        ],
        memory=False,
        verbose=False,
    )

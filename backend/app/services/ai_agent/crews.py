"""
CrewAI crew definitions for the TMT multi-agent system.

Crews:
  1. SOS Triage Crew — Risk scoring → Hospital recommendation → Alert dispatch
  2. Intel Analysis Crew — Telegram monitoring and intelligence extraction
  3. Verification Crew — Cross-referencing and trust management
"""
import json
import logging

from crewai import Crew, Task, Process

from app.services.ai_agent.agents import (
    build_risk_scorer,
    build_triage_agent,
    build_intel_agent,
    build_verify_agent,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Crew 1: SOS Triage Crew (Sequential — fast path)
# ---------------------------------------------------------------------------

def build_triage_crew() -> Crew:
    """Build a 2-agent crew for SOS triage: risk scoring → alert dispatch."""
    risk_scorer = build_risk_scorer()
    triage_agent = build_triage_agent()

    risk_task = Task(
        description=(
            "Assess patient {patient_id} at location ({latitude}, {longitude}).\n\n"
            "1. Query the patient's full profile (demographics, medical data, trust score)\n"
            "2. Query their medical records (conditions, medications, allergies, equipment)\n"
            "3. Query their SOS history (frequency, patterns, false alarm ratio)\n"
            "4. Find nearby active alerts to assess area danger level\n"
            "5. Find nearby hospitals with their status, beds, specialties, distance\n\n"
            "Based on ALL of this, compute:\n"
            "- A risk score from 0 to 100\n"
            "- A risk level: low (0-25), moderate (26-50), high (51-75), critical (76-100)\n"
            "- The recommended hospital (name, ID, distance, reason for recommendation)\n"
            "- Response urgency: immediate / within_1h / within_4h / when_available\n"
            "- A list of risk factors explaining the score\n\n"
            "Current SOS details: severity={severity}/5, status={patient_status}, "
            "message='{message}'\n\n"
            "IMPORTANT: Call the 'Update Risk Score' tool to persist the score to the database."
        ),
        expected_output=(
            "JSON with: risk_score (0-100), risk_level, risk_factors (list of strings), "
            "recommended_hospital (name, id, distance_km, reason), "
            "response_urgency (immediate/within_1h/within_4h/when_available), "
            "patient_summary (brief medical summary for responders)"
        ),
        agent=risk_scorer,
    )

    triage_task = Task(
        description=(
            "Triage SOS {sos_id} from patient {patient_id}.\n\n"
            "SOS details: severity={severity}/5, status={patient_status}, "
            "message='{message}', location=({latitude}, {longitude})\n\n"
            "Use the patient risk assessment from the previous step to:\n"
            "1. Classify the emergency event type (medical_emergency, building_collapse, "
            "   fire, bombing, shooting, flood, chemical, earthquake, infrastructure, other)\n"
            "2. Determine alert severity (low/medium/high/critical) — bump to 'critical' if "
            "   risk_score >= 80, or 'high' if >= 60\n"
            "3. DECIDE THE DEPARTMENT — route to exactly one of:\n"
            "   - 'hospital' for medical emergencies, injuries, illness\n"
            "   - 'police' for shootings, armed threats, security, crime, looting\n"
            "   - 'civil_defense' for fires, collapses, floods, earthquakes, rescue, hazmat\n"
            "4. Use 'Find Nearby Facilities' with the chosen department_type to find the best "
            "   facility to handle this case\n"
            "5. Check for Telegram intelligence corroborating the crisis at this location\n"
            "6. Create the alert using the Create Alert tool with:\n"
            "   - Descriptive title (max 80 chars)\n"
            "   - Details including patient vulnerabilities and facility recommendation\n"
            "   - routed_department set to the chosen department\n"
            "   - target_facility_id set to the best facility's ID\n"
            "   - metadata_json containing: sos_id, patient_id, patient_status, risk_score, "
            "     risk_level, routed_department, recommended_facility, response_urgency, "
            "     priority_factors, and patient_info from the SOS data\n"
            "   - source='sos'\n\n"
            "SOS patient_info payload: {patient_info}"
        ),
        expected_output=(
            "JSON with: alert_id, event_type, severity, title, "
            "routed_department (hospital/police/civil_defense), "
            "target_facility_id, risk_score, response_urgency, recommended_facility"
        ),
        agent=triage_agent,
        context=[risk_task],
    )

    return Crew(
        agents=[risk_scorer, triage_agent],
        tasks=[risk_task, triage_task],
        process=Process.sequential,
        memory=False,
        verbose=False,
    )


# ---------------------------------------------------------------------------
# Crew 2: Intel Analysis Crew
# ---------------------------------------------------------------------------

def build_intel_crew() -> Crew:
    """Build intel crew for Telegram monitoring and crisis extraction."""
    intel_agent = build_intel_agent()

    monitor_task = Task(
        description=(
            "Monitor Telegram channels for crisis events:\n\n"
            "1. Fetch latest messages from all monitored channels\n"
            "2. For each message, classify it as crisis or non-crisis\n"
            "3. For crisis messages: the classification tool extracts structured data "
            "   (event_type, severity, location, details) and stores embeddings "
            "   automatically\n"
            "4. For non-crisis messages: optionally store embedding for knowledge base\n"
            "5. Return a summary of all findings\n\n"
            "Focus on detecting: bombings, shootings, fires, building collapses, "
            "floods, chemical hazards, medical emergencies, infrastructure damage."
        ),
        expected_output=(
            "JSON with: messages_processed (int), crises_detected (int), "
            "crisis_events (list of {event_type, severity, location_text, details})"
        ),
        agent=intel_agent,
    )

    return Crew(
        agents=[intel_agent],
        tasks=[monitor_task],
        process=Process.sequential,
        memory=False,
        verbose=False,
    )


# ---------------------------------------------------------------------------
# Crew 3: Verification Crew
# ---------------------------------------------------------------------------

def build_verification_crew(events_to_verify: list[dict] | None = None) -> Crew:
    """Build verification crew for cross-referencing Telegram events."""
    verify_agent = build_verify_agent()

    events_str = json.dumps(events_to_verify or [], default=str)

    verify_task = Task(
        description=(
            "Verify the following Telegram-sourced events by cross-referencing:\n\n"
            f"Events to verify: {events_str}\n\n"
            "For each event:\n"
            "1. Search for corroborating events from non-Telegram sources within 3km\n"
            "2. Find related SOS requests from patients in the same area (within 2 hours)\n"
            "3. Determine if the event is verified (has corroboration) or unverified\n"
            "4. Assess confidence level (0.0-1.0)\n"
            "5. Calculate trust_delta for the source channel:\n"
            "   - Verified: +0.02 to +0.1\n"
            "   - Unverified, no corroboration: -0.01 to -0.05\n"
            "   - Clearly false: -0.05 to -0.1\n"
            "6. Update the channel trust score using the Update Channel Trust tool\n\n"
            "Return a summary of all verification results."
        ),
        expected_output=(
            "JSON with: events_checked (int), verified_count (int), "
            "results (list of {event_id, verified, confidence, trust_delta, reasoning})"
        ),
        agent=verify_agent,
    )

    return Crew(
        agents=[verify_agent],
        tasks=[verify_task],
        process=Process.sequential,
        memory=False,
        verbose=False,
    )

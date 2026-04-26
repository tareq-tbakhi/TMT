# TMT Lean Canvas

<div align="center">

**Startup-Focused Business Model**

Based on [Ash Maurya's Lean Canvas](https://leanstack.com/)

---

**Version 1.0** | **March 2026**

</div>

---

## What is Lean Canvas?

> "A Lean Canvas is a one-page consolidated business plan that contains nine prompts: problem, solution, key metrics, unique value proposition, unfair advantage, channels, customer segments, cost structure, and revenue streams." — [Canva](https://www.canva.com/online-whiteboard/lean-canvas/)

The Lean Canvas emphasizes **problems, solutions, and high-risk assumptions**. Its goal is to help startups quickly identify what might fail and validate ideas before investing heavily.

---

## TMT Lean Canvas

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                              TMT LEAN CANVAS                                                    │
├─────────────────────────┬─────────────────────────┬─────────────────────────┬─────────────────────────┬─────────┤
│                         │                         │                         │                         │         │
│   2. PROBLEM            │   4. SOLUTION           │   3. UNIQUE VALUE       │   9. UNFAIR             │   1.    │
│                         │                         │      PROPOSITION        │      ADVANTAGE          │CUSTOMER │
│   Top 3 Problems:       │   Top 3 Features:       │                         │                         │SEGMENTS │
│                         │                         │   Single clear message: │   Can't be easily       │         │
│   1. Emergency calls    │   1. One-tap SOS with   │                         │   copied:               │  Early  │
│      fail when          │      AI triage          │   ┌─────────────────┐   │                         │Adopters:│
│      infrastructure     │      conversation       │   │                 │   │   • 18+ months of      │         │
│      fails (70% in      │                         │   │  "Your SOS      │   │     development        │  • Gaza │
│      crisis zones)      │   2. Triple-layer       │   │   gets through  │   │                         │  Health │
│                         │      delivery:          │   │   —no matter    │   │   • AI models trained  │Ministry │
│   2. First responders   │      Internet → SMS     │   │   what."        │   │     on real triage     │         │
│      receive chaotic,   │      → Bluetooth Mesh   │   │                 │   │     scenarios          │  • UNRWA│
│      unstructured       │                         │   └─────────────────┘   │                         │  clinics│
│      emergency data     │   3. Multi-department   │                         │   • Regional expertise  │         │
│                         │      coordination       │   High-level concept:   │     (Arabic, crisis     │  • MSF  │
│   3. No offline         │      dashboard          │                         │     workflows)          │  field  │
│      capability for     │                         │   "WhatsApp + 911 +     │                         │  teams  │
│      crisis zones       │                         │    AI, built for war    │   • Government          │         │
│                         │                         │    zones"               │     relationships       │         │
│   ─────────────────     │                         │                         │                         │         │
│   Existing Alternatives:│                         │                         │                         │         │
│   • Traditional 911     │                         │                         │                         │         │
│   • WhatsApp (manual)   │                         │                         │                         │         │
│   • Radio (unreliable)  │                         │                         │                         │         │
│                         │                         │                         │                         │         │
├─────────────────────────┼─────────────────────────┼─────────────────────────┴─────────────────────────┴─────────┤
│                         │                         │                                                             │
│   8. KEY METRICS        │   5. CHANNELS           │   6. REVENUE STREAMS                                        │
│                         │                         │                                                             │
│   One metric that       │   Path to customers:    │   Revenue model:                                            │
│   matters (OMTM):       │                         │                                                             │
│                         │   • Direct government   │   • SaaS licensing: $50K-500K/year per government          │
│   ┌─────────────────┐   │     sales               │   • Per-seat pricing: $500/user/year for hospitals         │
│   │ SOS Delivery    │   │   • Humanitarian org    │   • Implementation services: $10K-50K per deployment       │
│   │ Success Rate    │   │     partnerships        │   • Training programs: $2K per session                     │
│   │                 │   │   • EU grant programs   │                                                             │
│   │ Target: 99.9%   │   │   • Conference presence │   First revenue target: $100K pilot contracts              │
│   │ (vs 70% today)  │   │   • Referrals           │                                                             │
│   └─────────────────┘   │                         │   Lifetime value: ~$75K per government customer            │
│                         │                         │                                                             │
│   Supporting metrics:   │   First channel:        │   7. COST STRUCTURE                                         │
│   • Triage time (sec)   │   Government direct     │                                                             │
│   • Response time (min) │   sales via pilots      │   Fixed costs:                                              │
│   • User activation %   │                         │   • Engineering team: $25K/month                            │
│   • Customer NPS        │                         │   • Cloud infrastructure: $3K/month                         │
│                         │                         │   • Operations: $5K/month                                   │
│                         │                         │                                                             │
│                         │                         │   Variable costs:                                           │
│                         │                         │   • SMS fees: $0.02/message                                 │
│                         │                         │   • AI API: $0.01/triage                                    │
│                         │                         │   • Customer support: ~$500/customer/month                  │
│                         │                         │                                                             │
│                         │                         │   Break-even: ~$600K ARR (8-10 customers)                   │
│                         │                         │                                                             │
└─────────────────────────┴─────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## Detailed Block Analysis

### 1. Customer Segments

**Who are we solving problems for?**

#### Early Adopters (First Customers)

| Segment | Why Early Adopter? | Urgency |
|---------|-------------------|---------|
| **Gaza Ministry of Health** | Active crisis, desperate need | 🔴 Critical |
| **UNRWA Health Clinics** | Serve 5.9M refugees, infrastructure poor | 🔴 Critical |
| **MSF Field Teams** | Work in hardest environments | 🟠 High |
| **Lebanese Red Cross** | Post-explosion rebuilding | 🟠 High |

#### Ideal Customer Profile

```
┌─────────────────────────────────────────────────────────────┐
│                 IDEAL EARLY ADOPTER                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   DEMOGRAPHICS:                                              │
│   • Government health ministry OR humanitarian NGO          │
│   • Located in MENA/Mediterranean crisis zone               │
│   • 50-500 emergency responders                             │
│   • Budget: $50K-200K for technology                        │
│                                                              │
│   PAIN INTENSITY:                                            │
│   • Lost lives due to communication failures                │
│   • Political pressure to improve emergency response        │
│   • Current systems failing during crises                   │
│                                                              │
│   BUYING TRIGGERS:                                           │
│   • Recent crisis event                                      │
│   • Grant funding available                                  │
│   • Leadership change prioritizing tech                      │
│                                                              │
│   ANTI-PERSONAS (NOT early adopters):                        │
│   ✗ Stable countries with working 911                        │
│   ✗ Small private clinics                                    │
│   ✗ Organizations with no tech budget                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Problem

**What are the top 3 problems we're solving?**

#### Problem 1: Infrastructure Failure

> **70% of emergency calls fail** in crisis zones due to network damage

| Aspect | Detail |
|--------|--------|
| **Who feels it** | Citizens in emergencies, emergency operators |
| **How painful** | Life-threatening (10/10) |
| **Current solution** | Retry calls, use WhatsApp, pray |
| **Why inadequate** | All require working internet |

#### Problem 2: Chaotic Triage

> **First responders waste 5-10 minutes** per call gathering basic information

| Aspect | Detail |
|--------|--------|
| **Who feels it** | Emergency operators, hospital staff |
| **How painful** | High (8/10) - delays cost lives |
| **Current solution** | Manual questioning, experience |
| **Why inadequate** | Inconsistent, slow, error-prone |

#### Problem 3: No Offline Capability

> **Zero functionality** when internet fails

| Aspect | Detail |
|--------|--------|
| **Who feels it** | Everyone in crisis zones |
| **How painful** | Critical (10/10) |
| **Current solution** | Radio, physical runners |
| **Why inadequate** | Slow, unreliable, not scalable |

#### Existing Alternatives

| Alternative | Why It Fails |
|-------------|--------------|
| **Traditional 911** | Requires working phone network |
| **WhatsApp** | No triage, no coordination, needs internet |
| **Radio** | Limited range, not scalable, no data |
| **Paper forms** | Slow, no real-time coordination |

---

### 3. Unique Value Proposition

**Single, clear, compelling message**

#### Primary UVP

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│        "Your SOS gets through—no matter what."              │
│                                                              │
│   When networks fail, TMT doesn't.                           │
│   Internet → SMS → Bluetooth Mesh.                           │
│   AI triage in seconds, not minutes.                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### High-Level Concept

> "WhatsApp + 911 + AI, built for war zones"

#### Supporting Claims

| Claim | Proof Point |
|-------|-------------|
| **"Gets through"** | Triple-layer delivery architecture |
| **"No matter what"** | Bluetooth mesh works with zero infrastructure |
| **"AI triage"** | 5-second severity classification |
| **"Built for war zones"** | Designed for Gaza, Lebanon, Syria |

---

### 4. Solution

**Top 3 features that address the problems**

#### Solution 1: One-Tap SOS with AI Triage

| Aspect | Detail |
|--------|--------|
| **Solves Problem** | #2 - Chaotic triage |
| **How it works** | Single tap triggers AI conversation |
| **User benefit** | Structured data in <30 seconds |
| **Status** | ✅ Complete |

#### Solution 2: Triple-Layer Delivery

| Aspect | Detail |
|--------|--------|
| **Solves Problem** | #1 - Infrastructure failure |
| **How it works** | Internet → SMS → Bluetooth automatically |
| **User benefit** | 99.9% delivery vs 70% |
| **Status** | ✅ Complete |

#### Solution 3: Multi-Department Coordination

| Aspect | Detail |
|--------|--------|
| **Solves Problem** | #3 - No offline capability |
| **How it works** | Unified dashboard for Hospital/Police/Civil Defense |
| **User benefit** | No more coordination chaos |
| **Status** | ✅ Complete |

---

### 5. Channels

**How do we reach early adopters?**

#### Channel Strategy

| Channel | Stage | Cost | Conversion |
|---------|-------|------|------------|
| **Direct Government Sales** | Pilot → Scale | High | High |
| **Humanitarian Partnerships** | Awareness → Pilot | Low | Medium |
| **EU Grant Programs** | Pilot | Medium | High |
| **Conferences** | Awareness | Medium | Low |
| **Referrals** | Scale | Zero | Very High |

#### First Channel Focus

```
FOCUS: Direct Government Sales via Pilots

Why:
1. Governments have budget
2. Success creates mandate for others
3. Credibility for NGO sales
4. Creates reference customers

Approach:
1. Identify crisis-affected Ministry of Health
2. Offer free 3-month pilot
3. Demonstrate value with real emergencies
4. Convert to paid contract
```

---

### 6. Revenue Streams

**How do we make money?**

#### Revenue Model

| Stream | Price | Target |
|--------|-------|--------|
| **Government SaaS** | $50K-500K/year | 70% of revenue |
| **Hospital Per-Seat** | $500/user/year | 20% of revenue |
| **Implementation** | $10K-50K/project | 8% of revenue |
| **Training** | $2K/session | 2% of revenue |

#### First Revenue Target

```
Year 1 Target: $100K

Breakdown:
• 1 government pilot → paid: $50K
• 2 hospital deployments: $30K
• Implementation services: $15K
• Training: $5K
```

---

### 7. Cost Structure

**What are our costs?**

#### Fixed Costs (Monthly)

| Cost | Amount | Notes |
|------|--------|-------|
| **Engineering** | $25,000 | 3-4 engineers |
| **Cloud Infrastructure** | $3,000 | AWS/GCP |
| **Operations** | $5,000 | Admin, legal, office |
| **Marketing** | $2,000 | Content, events |
| **Total Fixed** | $35,000/month | |

#### Variable Costs (Per Unit)

| Cost | Amount | Driver |
|------|--------|--------|
| **SMS** | $0.02 | Per message sent |
| **AI API** | $0.01 | Per triage session |
| **Support** | $500/month | Per customer |

#### Break-Even Analysis

```
Break-Even = Fixed Costs / Gross Margin per Customer

Fixed Costs: $35,000/month = $420,000/year
Avg Customer Value: $75,000/year
Gross Margin: 80%
Contribution per Customer: $60,000/year

Break-Even: 420,000 / 60,000 = 7 customers

With buffer: 8-10 customers = ~$600K ARR
```

---

### 8. Key Metrics

**One Metric That Matters (OMTM)**

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│   ONE METRIC THAT MATTERS:                                   │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                                                      │   │
│   │   SOS DELIVERY SUCCESS RATE                         │   │
│   │                                                      │   │
│   │   Current (traditional): 70%                        │   │
│   │   Target (TMT):          99.9%                      │   │
│   │                                                      │   │
│   │   If we nail this, everything else follows.         │   │
│   │                                                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Supporting Metrics

| Metric | Current | Target | Why It Matters |
|--------|---------|--------|----------------|
| **Triage Time** | 5-10 min | <30 sec | Faster = lives saved |
| **Response Time** | Variable | <5 min | Speed of dispatch |
| **User Activation** | — | >80% | Product-market fit |
| **Customer NPS** | — | >50 | Retention & referrals |

#### Pirate Metrics (AARRR)

| Stage | Metric | Target |
|-------|--------|--------|
| **Acquisition** | Pilots started | 5 in Year 1 |
| **Activation** | First SOS sent | >90% of pilots |
| **Retention** | Pilot → Paid | >60% |
| **Referral** | Customer referrals | 1 per customer |
| **Revenue** | ARR | $100K Year 1 |

---

### 9. Unfair Advantage

**What can't be easily copied or bought?**

#### Our Unfair Advantages

| Advantage | Why Hard to Copy |
|-----------|------------------|
| **18+ months development** | Time to market |
| **AI trained on real scenarios** | Data moat |
| **Regional expertise** | Arabic, crisis workflows |
| **Government relationships** | Trust takes years |
| **Triple-layer architecture** | Complex integration |
| **Team domain knowledge** | Emergency response experience |

#### Building Defensibility

```
Now:                    6 months:               12 months:
┌─────────────┐        ┌─────────────┐         ┌─────────────┐
│ Technical   │        │ Data moat   │         │ Network     │
│ complexity  │  ───►  │ (triage     │  ───►   │ effects     │
│ (18 months) │        │ patterns)   │         │ (referrals) │
└─────────────┘        └─────────────┘         └─────────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │ Government  │
                       │ relationships│
                       │ (contracts) │
                       └─────────────┘
```

---

## Riskiest Assumptions

### Top 3 Risks to Validate

| Rank | Assumption | Risk | Validation Method |
|------|------------|------|-------------------|
| 1 | Governments will pay for crisis tech | Medium | Pilot → paid conversion |
| 2 | Triple-layer delivery works at scale | Low | Technical testing (done) |
| 3 | AI triage is accurate enough | Medium | Medical validation study |

### Experiment Plan

```
EXPERIMENT 1: Government Willingness to Pay

Hypothesis: Gaza MOH will convert pilot to paid contract
Test: Offer free 3-month pilot, track engagement
Success: Signed contract at $50K+
Timeline: 6 months
```

---

## Pivot Triggers

### When to Pivot

| Signal | Pivot Direction |
|--------|-----------------|
| Governments won't pay | Focus on NGO/humanitarian |
| Technical barriers in region | Target disaster (not conflict) zones |
| AI triage liability concerns | Simplify to communication only |
| Large competitor enters | Specialize in specific vertical |

---

## References

- [What is a Lean Canvas? - Canva](https://www.canva.com/online-whiteboard/lean-canvas/)
- [Lean Canvas vs Business Model Canvas - Creately](https://creately.com/guides/lean-canvas-vs-business-model-canvas/)
- [Free Lean Canvas Template - Mural](https://www.mural.co/templates/lean-canvas)

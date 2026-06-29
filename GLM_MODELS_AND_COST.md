# TMT — GLM Model Selection & Expected Cost

**Provider:** Z.ai (Zhipu) — OpenAI-compatible API at `https://api.z.ai/api/paas/v4`
**Date:** 2026-06-29 · Prices from the official Z.ai pricing page (USD).
**Policy chosen:** "best model for each job, even if overkill" (per request).

> ⚠️ **Security:** the API key was shared in chat. It's stored only in the gitignored `tmt/.env` (never committed). **Rotate it** in the Z.ai console after this session, since a key pasted into a chat should be treated as exposed.

---

## 1. Model selection (configured in `backend/app/config.py`)

| Task | Model configured | Why this one | Price (per 1M tokens unless noted) |
|---|---|---|---|
| Reasoning / triage / intel / conversational AI | **`glm-5.2`** | Current flagship (there is no 5.3; 5.2 is the top text model) | $1.40 in / $4.40 out · cached in $0.26 |
| Image understanding (photo/scene breakdown) | **`glm-5v-turbo`** | Best vision model on Z.ai | $1.20 in / $4.00 out |
| Document OCR (IDs, medical docs) | **`glm-ocr`** | Dedicated OCR, best-fit & very cheap | $0.03 in / $0.03 out |
| Image generation (situational graphics) | **`glm-image`** | Newest image generator (vs CogView-4) | $0.015 / image |
| (available, not wired) Web search tool | built-in | Source verification for news/intel | $0.01 / use |
| (available, not wired) Video gen | CogVideoX-3 / Vidu | No Lot C use case yet | $0.2–0.4 / video |

These are now the defaults; each is overridable via env (`GLM_MODEL_REASONING`, `GLM_MODEL_VISION`, `GLM_MODEL_OCR`, `GLM_MODEL_IMAGE`, `GLM_API_BASE`). The active code paths (triage `agent.py`, CrewAI `agents.py`) now use `glm-5.2`.

**Free tiers that exist** (for cost control if you ever want it): `glm-4.7-flash`, `glm-4.5-flash` (text) and `glm-4.6v-flash` (vision) are **$0**. We are *not* using them by default per your "best for everything" instruction — but they're the main cost lever (see §4).

---

## 2. Per-operation cost (best models, rough token assumptions)

Estimates assume typical prompt sizes; actual varies with context length.

| Operation | Model | Assumed tokens | Est. cost |
|---|---|---|---|
| SOS triage — single LLM call | glm-5.2 | ~4k in / 1k out | **~$0.010** |
| SOS triage — full CrewAI multi-agent (~3 calls) | glm-5.2 | ~12k in / 3k out | **~$0.030** |
| SOS triage — rule-based fallback (no key needed) | none | — | **$0.000** |
| Telegram message classification | glm-5.2 | ~1k in / 0.2k out | **~$0.0023** |
| Conversational assistant — one turn | glm-5.2 | ~1.5k in / 0.3k out | **~$0.0034** |
| Image understanding — one photo | glm-5v-turbo | ~1.5k in / 0.3k out | **~$0.0030** |
| Document OCR — one doc | glm-ocr | ~1.5k total | **~$0.00005** (negligible) |
| Image generation — one image | glm-image | per image | **$0.015** |

---

## 3. Expected monthly cost — three scenarios

Telegram ingestion is **OFF by default** (compliance gate), so it's shown as a separate add-on. "Assistant" assumes ~4 turns per SOS.

### Pilot (low volume) — ~500 SOS/month
| Line | Volume | Cost |
|---|---|---|
| SOS triage (CrewAI, best) | 500 | $15.00 |
| Conversational assistant | 2,000 turns | $6.80 |
| Image understanding | 300 | $0.90 |
| Image generation | 50 | $0.75 |
| OCR | 500 | ~$0.02 |
| **Subtotal (Telegram off)** | | **≈ $23/mo** |
| + Telegram intel (if enabled) | 10,000 msgs | +$23 |
| **With Telegram on** | | **≈ $46/mo** |

### Active deployment (medium) — ~5,000 SOS/month
| Line | Volume | Cost |
|---|---|---|
| SOS triage (CrewAI) | 5,000 | $150 |
| Conversational assistant | 20,000 turns | $68 |
| Image understanding | 3,000 | $9 |
| Image generation | 500 | $7.50 |
| OCR | 5,000 | ~$0.25 |
| **Subtotal (Telegram off)** | | **≈ $235/mo** |
| + Telegram intel (if enabled) | 100,000 msgs | +$230 |
| **With Telegram on** | | **≈ $465/mo** |

### Crisis surge (high) — ~50,000 SOS/month
| Line | Volume | Cost |
|---|---|---|
| SOS triage (CrewAI) | 50,000 | $1,500 |
| Conversational assistant | 200,000 turns | $680 |
| Image understanding | 20,000 | $60 |
| Image generation | 2,000 | $30 |
| **Subtotal (Telegram off)** | | **≈ $2,270/mo** |
| + Telegram intel (if enabled) | 1,000,000 msgs | +$2,300 |
| **With Telegram on** | | **≈ $4,570/mo** |

---

## 4. Cost levers (how to cut this a lot without losing quality where it matters)

1. **Two-tier intel ingestion (biggest saver).** Telegram/news classification is the largest variable cost. Run the cheap/free **`glm-4.5-flash` ($0)** as a first-pass filter and only escalate flagged messages to `glm-5.2`. This can cut the Telegram line by ~90% while keeping the flagship for the decisions that matter. (Currently everything uses `glm-5.2` per your instruction.)
2. **Cached input.** System prompts / repeated patient context bill at **$0.26/M instead of $1.40/M** (cached-input storage is "limited-time free" right now). Structuring prompts so the static parts are cached can cut triage input cost ~80%.
3. **Rule-based triage is free** and already runs without any key — GLM only *upgrades* quality. If budget spikes, you can fall back automatically.
4. **OCR is effectively free** (`glm-ocr` at $0.03/M) — use it liberally for IDs/medical docs.
5. **Reserve `glm-5.2` for reasoning**; vision/OCR/image-gen are already on cheaper dedicated models.

---

## 5. Caveats

- Token counts are **estimates** — real cost depends on prompt/context size and how many CrewAI agent calls each triage makes. Treat §3 as order-of-magnitude.
- "Limited-time free" cached-input storage and the free Flash tiers are Z.ai promotions that can change.
- Costs above are **LLM API only** — they exclude infrastructure (Postgres/PostGIS, Redis, Qdrant, hosting), SMS (Twilio), and mobile store/push fees.
- Telegram live ingestion also requires Bot API credentials **and** a documented compliance review before it's switched on (separate from cost).

---
id: b542b2c1-e587-401a-8f54-ded9bc1f7312
title: Unscripted
tags: []
pinned: false
created: 2026-10-10T13:52:45.806649297+00:00
modified: 2026-10-10T14:15:00.000000000+00:00
---
# Unscripted

# AI-Driven Island Survival Simulation

## MVP Game Design Specification — v0.3

**Status:** Draft for review  
**Platform:** Desktop-first (Linux initially)  
**Technology:** Tauri v2, React, TypeScript, Rust (native layer), SQLite  
**AI provider:** Groq free tier (gpt-oss-120b and gpt-oss-20b)  
**Game type:** Single-player, text-based survival simulation  
**Game duration:** Two in-game nights  
**Characters:** One player and two autonomous NPCs  
**Player goal:** Light a signal fire on the Hilltop before Day 3, 08:00

### Changes in v0.3

- Added Appendix A: Phase 1 World Rules, with starting values for the island, items, signal fire, weather, fatigue, health, shelter, actions, and test scenarios.
- Section 9 rows covered by Appendix A are marked "Proposed".

### Changes from v0.1

- Added a player goal: the signal fire (1.5).
- The simulation clock pauses during every AI call (2.4, 7.3).
- Selected Groq free tier with two models (7.1, 7.5).
- Added an AI call budget (7.10).
- AI requests and the API key move to the Rust native layer (7.2, 7.8).
- Deliberate deception is deferred until after the pilot (3.8).
- Memory summaries are removed from the MVP (4.5).
- Added a post-session checklist to replace subjective success criteria (8.8).
- Reordered development phases so the knowledge model comes before AI (10).

---

# 1. Game Vision and Scope

## 1.1 Vision

Create a small, persistent virtual world in which a human player controls one character while AI-controlled characters make independent decisions.

The game does not follow a predefined storyline or require the player to choose from fixed story branches.

Instead, stories emerge naturally from:

- Individual character goals and personalities.
- Independent NPC decisions and actions.
- Environmental conditions and natural events.
- Cooperation, disagreements, and social relationships.
- Incomplete information and mistaken beliefs.
- The consequences of player and NPC actions.

The goal is to create believable and sometimes unexpected experiences within a consistent simulated world.

## 1.2 Core Principles

1. **World independence:** The simulation continues regardless of player participation.
2. **Equal autonomy:** NPCs and the player follow the same physical rules.
3. **No forced drama:** Events happen because of world conditions and probability, not because the story needs excitement.
4. **Persistent consequences:** Meaningful actions permanently affect world state or character memory.
5. **Limited knowledge:** Characters know only what they observe, learn, remember, or believe.
6. **Flexible interaction:** The player can attempt creative actions, subject to world rules.
7. **AI does not control reality:** The game engine validates and applies outcomes.

## 1.3 MVP Boundaries

The pilot includes:

- One remote island.
- Five predefined locations.
- One player-controlled character with one goal (the signal fire).
- Two autonomous NPCs.
- Two complete in-game nights.
- Accelerated real-time simulation.
- Weather, shelter, health, and simplified fatigue.
- Character personalities, goals, and relationships.
- Independent NPC planning and communication.
- Private knowledge, memories, and beliefs.
- Free-text player actions with suggested actions.
- Persistent state, event logging, and final reporting.
- A fixed AI call budget per session.

The pilot excludes multiplayer, combat, complex crafting, hunger, thirst, detailed resource management, elaborate medical systems, procedurally generated maps, deliberate NPC deception, and memory summaries.

## 1.4 Purpose of the Pilot

The MVP is a personal simulation experiment, not a commercial game.

Its main purpose is to verify whether a small number of AI-assisted autonomous characters can create believable situations without predefined story branches, within the limits of a free AI provider.

## 1.5 Player Goal: Signal Fire

The player's goal is to have a signal fire burning on the Hilltop before Day 3, 08:00.

**Requirements:**

- Enough wood, collected in the Forest.
- A fire starter (for example, a flare or lighter), found in the Wreckage.
- Time spent building the fire at the Hilltop.

**Rules:**

- The goal is a normal world object, not a scripted quest. The engine applies the same rules to it as to anything else.
- Rain and wind can put out the fire or prevent lighting it.
- A lit fire burns for a limited time and can be refueled with more wood.
- NPCs do not know the player's goal unless the player tells them.
- NPCs may want the same resources for their own goals, such as wood for the shelter.
- NPCs may help, refuse, or light a fire on their own initiative.
- Rescue is not guaranteed, even if the fire is lit.

**Outcome states (recorded in the final report):**

- Not lit.
- Lit, but out at the end.
- Still burning at Day 3, 08:00.

The report also records who collected the materials and who lit the fire.

Exact wood amount, burn time, and weather effects remain open (see section 9).

---

# 2. World and Environment

## 2.1 Setting

Three survivors are stranded on a remote island.

The island contains limited shelter, usable natural materials, damaged equipment, and environmental hazards.

There is no guaranteed rescue during the pilot.

The specific cause of the characters becoming stranded remains a narrative detail to finalize. It should not determine their future decisions.

## 2.2 Locations

| Location | Purpose | Main activities |
| --- | --- | --- |
| Beach Camp | Starting area | Rest, shelter repair, conversations |
| Forest | Natural materials | Explore, collect wood, observe wildlife |
| Wreckage | Damaged equipment | Search, salvage, inspect |
| Cave | Alternative shelter | Explore, inspect, take cover |
| Hilltop | Observation point, signal fire site | Scout, observe weather, build signal fire |

Every location has persistent state, accessible routes, physical conditions, and possible objects or activities.

Travel requires time. Visibility, weather, fatigue, and route conditions may affect travel.

## 2.3 Partial Discovery

The complete map exists in the game database, but characters do not begin with complete knowledge of it.

Locations and routes may be discovered through:

- Exploration.
- Direct observation.
- Conversations.
- Information provided by another character.

Each character maintains their own map knowledge.

Discovering a location does not automatically reveal it to everyone.

A character may share a discovery, withhold it, or describe it incorrectly by honest mistake. Deliberate lying is deferred until after the pilot (see 3.8).

## 2.4 Accelerated Real-Time

**Approved default:** One in-game day equals 30 real minutes at normal speed.

| Configuration | Value |
| --- | --- |
| Starting time | Day 1, 08:00 |
| Ending time | Day 3, 08:00 |
| Simulated duration | 48 in-game hours |
| Normal play duration | Approximately 60 real minutes, plus AI pauses |
| Available speeds | Pause, 1×, 2×, 4× |
| Simulation step | One in-game minute |
| Offline progression | Disabled |

The simulation continues during ordinary gameplay, including while NPCs travel, work, or interact.

**The clock pauses during every AI call.** NPC thinking costs no game time. This keeps outcomes independent of network speed and makes test sessions comparable.

The clock also pauses during player text entry and response reading where needed. An interaction can consume a defined amount of game time when processed.

The game may pause automatically when the player must respond to an urgent event.

The simulation clock is owned by the game engine, not the UI.

## 2.5 Environment Simulation

The World Engine handles:

- Passage of time.
- Day and night.
- Weather changes.
- Shelter condition.
- Signal fire condition.
- Environmental hazards.
- Effects on characters, objects, and locations.

Events follow environmental conditions and defined probabilities.

Possible events include rain, wind, lightning, changing visibility, and wildlife encounters.

Not all events need to be dramatic. Quiet periods are acceptable.

## 2.6 World Director

The MVP uses a rule-based World Director.

Its responsibilities are to evaluate environmental conditions, schedule possible natural events, and resolve their effects through the game engine.

The Director must not:

- Force a confrontation.
- Create resources to help a character.
- Change probabilities merely to produce drama.
- Change weather to help or block the signal fire.
- Override established world state.
- Guarantee survival or failure.

A dedicated AI World Director is excluded from the MVP.

---

# 3. Characters and Autonomy

## 3.1 Character Structure

The game contains three characters:

- One human-controlled player character.
- Two independently controlled NPCs.

All characters share the same world rules and physical limitations.

NPCs do not automatically treat the player as their leader.

## 3.2 Character Profiles

Each NPC has:

**Core identity**

- Name, age, and background.
- Personality traits.
- Values and motivations.
- Practical skills and weaknesses.
- Important past experiences.

**Personal state**

- Knowledge and beliefs.
- Relationships and trust.
- Fears and stress.
- Current needs.
- Personal goals.
- Active plans and commitments.

Core personality remains relatively stable during the pilot.

Relationships, beliefs, priorities, stress, and behavior may change through experiences.

The final character backgrounds and names remain to be approved.

## 3.3 NPC Goals

Each NPC maintains personal goals.

Goals may include:

- Finding safe shelter.
- Helping an injured character.
- Exploring an unknown area.
- Protecting personal possessions.
- Recovering an important object.
- Maintaining independence.

An NPC may have private goals unknown to other characters.

At least one NPC goal should compete with the signal fire for time or resources, so cooperation is a real choice rather than a default.

Goals influence decisions but do not guarantee outcomes.

## 3.4 Hybrid NPC Intelligence

Routine behavior is managed through deterministic game rules.

Examples:

- Walking along a known route.
- Continuing an assigned task.
- Resting when exhausted.
- Completing ordinary collection work.

AI assists when decisions require judgment.

Examples:

- Choosing between competing goals.
- Responding to disagreements.
- Deciding whether to trust someone.
- Revising plans after new information.
- Negotiating assistance.
- Deciding whether to withhold information.

The same language model serves both NPCs, but each request uses an isolated character context.

## 3.5 Independent Planning

NPCs must be able to:

- Create personal plans.
- Begin activities independently.
- Reconsider priorities.
- Change or abandon plans.
- Request help.
- Cooperate with others.
- Refuse requests.
- Make shared commitments.
- Break commitments when circumstances justify doing so.

Characters should continue valid ongoing activities without repeatedly consulting AI.

New decisions are triggered by task completion, major observations, urgent needs, significant interactions, or periodic plan reviews (every 3 in-game hours; see 7.10).

## 3.6 Equal Autonomy

NPCs can act against the player's interests.

They may:

- Take accessible items.
- Withhold assistance.
- Leave the group.
- Withhold discoveries.
- Refuse instructions.
- Abandon shared activities.

They may not use abilities unavailable to the player or obtain information without a valid source.

Physical combat is outside MVP scope.

## 3.7 Social Relationships

Characters maintain trust and relationship state.

Trust may increase or decrease based on observed cooperation, broken promises, withheld information, assistance, and other meaningful experiences.

Relationships do not need to be symmetrical.

For example, Marcus may trust Sarah while Sarah distrusts Marcus.

Numerical trust values remain internal. The player learns about relationships through observable behavior.

## 3.8 Deception (Deferred)

Deliberate deception is excluded from the MVP and planned for after the pilot.

The MVP supports three kinds of statements:

- Truthful statements.
- Honest mistakes (the speaker believes something false).
- Withheld information (the speaker stays silent or refuses to answer).

A false statement in the MVP always comes from a mistaken belief, never from intent to mislead.

Adding deliberate deception later requires a statement model that records speaker intent. This is not built for the MVP.

## 3.9 NPC Communication

The MVP uses hybrid conversations.

Routine interactions may be resolved through rules.

Important conversations use AI to evaluate intentions, responses, decisions, and consequences.

Full dialogue is generated primarily when the player can hear or participate.

Off-screen conversations still occur and affect the simulation, but are recorded as structured interaction events rather than full dialogue transcripts.

Communication requires a valid physical or supported communication channel.

Characters cannot communicate telepathically across locations.

---

# 4. Memory and Knowledge

## 4.1 Memory Architecture

SQLite stores persistent world state, events, and character information.

The game separates objective reality from individual character understanding.

Four important information categories are maintained:

1. **World truth:** What objectively happened or exists.
2. **Observations:** What each character directly experienced.
3. **Beliefs:** What each character thinks is true.
4. **Personal memory:** Important experiences that influence future behavior.

## 4.2 Permanent Event History

Meaningful actions and outcomes are recorded in an append-only event history.

An event may record:

- Game time.
- Actor.
- Action attempted.
- Actual outcome.
- Location.
- Relevant participants.
- Observable consequences.

The event history provides a reliable record for debugging and final reports.

Current world state is stored separately and updated through validated engine operations.

A full event-sourcing architecture is not required.

## 4.3 Private Character Knowledge

Each character may have different information about the same event.

For example:

- The world knows Marcus took a tool.
- Sarah witnessed Marcus entering the storage area.
- The player noticed that the tool is missing.
- Marcus knows what he did.

These facts must not automatically merge into shared knowledge.

Information sharing occurs through actual observations or interactions.

## 4.4 Memory Retrieval

Before an AI decision, the application retrieves relevant character information.

The context may include:

- Stable personality.
- Current physical condition.
- Known environment.
- Current goals.
- Active plans.
- Important relationships.
- Relevant observations.
- Recent interactions.
- Relevant long-term memories.

AI must not receive hidden world truth that the character is not entitled to know.

Each AI context is capped at about 1,500 input tokens (see 7.10).

Initial retrieval uses structured SQLite queries and, when useful, full-text search.

Vector search is not required for the MVP.

## 4.5 Context Selection (No Summaries in MVP)

The MVP does not summarize memories.

All history stays stored. When the context cap is reached, retrieval selects items by a fixed priority:

1. Stable identity and current physical state.
2. Current goals, plans, and commitments.
3. Observations and interactions related to the current decision.
4. Most recent events.

Lower-priority items are left out of that request, not deleted.

A 48-hour session with three characters is small enough that selection without summaries should be sufficient. Summaries may be added after the pilot if needed.

## 4.6 Player Journal

The player has a journal containing information their character has experienced or learned.

The journal may include observations, discoveries, important conversations, promises, and progress toward the signal fire.

Statements made by NPCs remain attributed to their speakers.

The journal does not expose private NPC thoughts or events occurring elsewhere.

---

# 5. Interaction and Simulation

## 5.1 Player Interaction

The interface supports free-text input and suggested actions.

The player may write intentions in natural language, such as:

"I want to quietly follow Sarah into the forest."

Suggested actions provide convenient shortcuts but do not restrict player creativity.

Suggested actions map directly to engine actions and do not need an AI call. Only free-text input uses the interpreter.

## 5.2 Action Categories

| Action | Examples |
| --- | --- |
| Move | Travel, follow, sneak |
| Observe | Inspect, watch, examine |
| Communicate | Ask, persuade, warn, negotiate |
| Interact | Take, give, hide, move objects |
| Work | Gather, search, repair, build fire |
| Rest | Sleep, recover |
| Wait | Allow game time to pass |

Complex intentions may require several sequential actions.

The system must not instantly complete a multi-step plan.

## 5.3 Action Processing

Every action follows four stages:

1. Interpret intention.
2. Validate against current world state.
3. Resolve the attempted action and consequences.
4. Narrate what the character can observe.

AI may interpret intentions but cannot directly modify game state.

The game engine is the authority for action validation and outcomes.

## 5.4 Outcomes

Actions may have deterministic, conditional, or uncertain outcomes.

Deterministic actions succeed when all known requirements are satisfied.

Conditional actions depend on physical conditions, equipment, available time, or abilities.

Uncertain actions use defined world rules and probabilities.

Randomness should not be introduced when it serves no meaningful purpose.

## 5.5 Long-Running Activities

Activities such as collecting wood, traveling, resting, repairing shelter, and building the signal fire consume game time.

Progress persists.

Activities may be interrupted by environmental changes, character conditions, other actions, or deliberate cancellation.

NPCs follow the same rules as the player.

## 5.6 Physical Systems

**Included systems:**

Environment:

- Weather.
- Natural hazards.
- Shelter condition.
- Signal fire condition.

Physical condition:

- Health.
- Injury.
- Simplified fatigue.

Social behavior:

- Trust.
- Relationships.
- Goals.
- Agreements.

Fatigue uses three conditions:

- Rested.
- Tired.
- Exhausted.

Fatigue affects activity performance and available actions.

Detailed hunger, thirst, and medical treatment are excluded.

## 5.7 Unsupported Actions

Creative actions are permitted when they can be resolved using existing world rules.

If an intention requires a mechanic that does not exist, the game explains the limitation.

The narrator must not pretend an unsupported action succeeded.

## 5.8 Player Perspective

The normal game view uses the player character's limited perspective.

It displays:

- Current time and location.
- Player health and fatigue.
- Observable weather and conditions.
- Nearby visible NPCs and objects.
- Narration of observable events.
- Player action input.
- Relevant suggested actions.
- Journal, discovered locations, and known signal fire progress.

It does not reveal NPC private thoughts, hidden plans, or distant events without a valid information source.

---

# 6. Failure and Endings

## 6.1 Fixed Duration

The simulation starts on Day 1 at 08:00.

It ends on Day 3 at 08:00.

There is no mandatory rescue or scripted climax. The signal fire is a goal, not a winning condition: the session ends at the fixed time whatever its state.

## 6.2 Injuries and Incapacitation

Injuries may reduce character abilities.

Serious conditions may prevent certain actions.

An unconscious character cannot perform actions.

The simulation continues independently.

If the player recovers, normal control resumes.

## 6.3 Death

Character death must result from valid world conditions and supported game rules.

An AI model cannot independently declare that a character has died.

If the player dies, player control ends permanently for that session.

The NPCs and environment continue until the scheduled simulation ending.

If all characters die, the environment may still continue until the ending time.

## 6.4 Final Simulation Report

At the end, the application produces a report based on stored events and world state.

The report includes:

- Signal fire outcome (not lit, lit but out, still burning), who collected materials, and who lit it.
- Final character conditions.
- Important discoveries.
- Shelter and environmental outcomes.
- Major character actions.
- Agreements and conflicts.
- Relationship changes.
- Significant unexpected events.
- AI usage for the session (calls and tokens per model).
- A chronological summary.

The report may reveal information that was hidden from the player during gameplay.

Recorded facts must remain distinguishable from beliefs, interpretations, and inferred motives.

The report must not invent events to create a more dramatic ending.

---

# 7. Technical Architecture

## 7.1 Approved Technology Stack

| Component | Technology |
| --- | --- |
| Desktop framework | Tauri v2 |
| Frontend | React + TypeScript |
| Game simulation | TypeScript |
| AI requests and credentials | Rust (Tauri native layer) |
| Database | SQLite |
| AI provider | Groq free tier, OpenAI-compatible API |
| NPC decision model | gpt-oss-120b |
| Interpreter and narration model | gpt-oss-20b |
| Memory retrieval | SQLite queries and full-text search |
| Primary platform | Linux |
| Game persistence | Local SQLite |

The application is desktop-first and single-player.

No dedicated multiplayer server is required.

## 7.2 Architecture Responsibilities

**React Interface**

Responsible for rendering game state, displaying narration, accepting player input, showing the journal, and providing pause and speed controls.

React does not independently modify authoritative world state.

**Simulation Engine (TypeScript)**

Responsible for the game clock, character activities, environment updates, action validation, physical consequences, and state transitions.

It is independent of the React interface.

**NPC Decision Service (TypeScript)**

Builds isolated decision contexts from each NPC's knowledge, goals, personality, and state.

Routine actions use rules.

Complex decisions are sent to the AI gateway as separate requests.

**Narration Service (TypeScript)**

Converts validated events and observations into natural language.

Routine events use templates. AI narration is used only for key moments (see 7.10).

Narration must not invent world changes.

**AI Gateway (Rust)**

Holds the API key, sends requests to Groq, enforces the call budget, reads rate-limit headers, and returns responses to TypeScript through Tauri commands.

The API key never enters the webview.

**Persistence Layer**

Stores current state, character information, knowledge, beliefs, plans, event history, AI usage, and game saves.

**Tauri Native Layer**

Provides desktop lifecycle management, file and database access, the AI gateway, and secure credential storage.

Any further division between TypeScript and Rust responsibilities will be settled in technical design.

## 7.3 Simulation Clock

The engine owns one authoritative simulation clock.

The initial simulation resolution is one in-game minute.

The game supports pause, 1×, 2×, and 4× speed.

The clock pauses while any AI request is in progress, including time spent waiting on a rate limit. It resumes when the response has been validated and applied, or rejected.

When the application is closed, simulated time does not advance.

After loading, the game resumes from its saved state.

NPC activities and environmental events advance according to simulated time rather than real-world timestamps.

## 7.4 AI Decision Safety

AI decisions must be validated before execution.

The application must handle:

- Invalid AI output.
- Failed API requests.
- Slow responses.
- Rate-limit errors (HTTP 429).
- Contradictory decisions.
- Requests based on outdated state.
- Actions that violate world rules.

An AI request should be associated with the world-state version used to prepare it.

Because the clock pauses during AI calls, outdated state is less likely. The version check is still required, because two NPC requests can be prepared from the same state.

If the world changes in a way that invalidates the proposed action, the decision must be revalidated, rejected, or reconsidered.

The simulation must never apply an invalid outcome simply because an AI model requested it.

## 7.5 AI Request Strategy

The MVP uses two Groq models with separate, task-specific requests:

| Task | Model |
| --- | --- |
| NPC decisions and important conversations | gpt-oss-120b |
| Free-text player action interpretation | gpt-oss-20b |
| Key-moment narration | gpt-oss-20b |

Each NPC request receives only relevant information that character is permitted to know.

No persistent model instance is required for each NPC. Character continuity comes from stored identity, memory, goals, and state.

Responses use a structured format (JSON) that the engine validates before use.

Groq lists rate limits per model. Whether the two models have fully separate daily quotas must be verified in Phase 1. If they share a quota, the budget in 7.10 is halved and the session plan must be reduced.

Free-tier limits and available models may change. Model names are configuration values, not hardcoded.

## 7.6 AI Failure Handling

The game should remain usable when the AI provider is temporarily unavailable.

Existing valid NPC activities may continue.

Routine decisions may fall back to predefined rules.

Complex decisions may be deferred until AI is available.

The system must not invent completed social interactions or outcomes merely to hide an AI failure.

AI failures and fallback behavior are recorded for debugging.

## 7.7 Data Persistence

SQLite stores both current state and historical events.

Game sessions are isolated.

Database operations that change multiple related records should be applied atomically to avoid partial world updates.

Save and load must preserve:

- Current time.
- Character conditions and locations.
- Active activities.
- Plans and commitments.
- World conditions, including the signal fire.
- Discoveries and knowledge.
- Beliefs and relationships.
- Important memories.
- Event history.
- Pending scheduled events.
- AI usage for the session.

## 7.8 Security and AI Credentials

Hosted AI access requires internet connectivity.

The Groq API key is entered by the user and stored in secure OS storage through the Rust layer.

The key must not appear in frontend source, the webview, distributed assets, logs, or the debugger.

If the application is distributed more widely, credential management and API access policy require a separate security review.

## 7.9 Debugging and Observability

Development builds should expose an internal simulation debugger.

It should allow inspection of:

- World truth.
- Character state.
- Private knowledge.
- Current goals and plans.
- NPC decisions.
- Event history.
- AI requests and responses.
- Rejected actions.
- AI failures and rate-limit waits.
- Token and call counts per model, with remaining daily budget.
- Relevant simulation timing.

The debugger is separate from the normal player interface.

For repeatable tests, the simulation should support a recorded random seed and initial state. AI responses should also be recordable for replay, because a random seed alone cannot guarantee identical AI decisions. Replay also saves AI budget during testing.

## 7.10 AI Call Budget

The Groq free tier limits each model to about 30 requests per minute, 1,000 requests per day, 8,000 tokens per minute, and 200,000 tokens per day. These values must be confirmed on the Groq limits page before Phase 4, since they can change.

**Rules to stay within budget:**

- Each AI context is capped at about 1,500 input tokens.
- Each response sets a maximum output length.
- NPC plan reviews happen every 3 in-game hours, plus triggered decisions (3.5).
- Suggested actions skip the interpreter.
- Routine events use template narration. AI narration is used only for key moments, such as a first meeting, a conflict, or the signal fire being lit.
- Off-screen conversations are resolved as structured events, not full dialogue.

**Estimated session usage:**

| Call type | Model | Calls | Tokens (approx.) |
| --- | --- | --- | --- |
| NPC plan reviews | gpt-oss-120b | ~32 | |
| Triggered NPC decisions and conversations | gpt-oss-120b | ~30 | |
| **gpt-oss-120b total** | | **~62** | **~115,000** |
| Free-text interpretation | gpt-oss-20b | ~40 | |
| Key-moment narration | gpt-oss-20b | ~20 | |
| **gpt-oss-20b total** | | **~60** | **~90,000** |

This allows one full session per day with margin.

At about 1,800 tokens per call, the 8,000 tokens-per-minute limit allows about 4 calls per minute per model. Short waits are expected and are absorbed by the clock pause.

**Low budget behavior:**

- The AI gateway tracks usage from response headers and its own counts.
- When a model's remaining daily budget falls below a set threshold, the game saves and pauses with a clear message.
- The player can resume the session after the quota resets.
- The game must not switch silently to rule-only behavior for complex decisions to avoid the pause.

---

# 8. MVP Acceptance Criteria

## 8.1 NPC Autonomy

- NPCs initiate activities without player instructions.
- NPCs pursue individual goals.
- NPCs can independently change plans.
- NPCs can cooperate, disagree, and refuse requests.
- NPCs continue acting when the player is elsewhere or incapacitated.

## 8.2 Memory and Consistency

- Character discoveries remain private until communicated or independently observed.
- NPCs remember important actions and commitments.
- False beliefs remain distinguishable from world truth.
- Characters do not gain impossible information.
- World state changes persist correctly.

## 8.3 Interaction

- The player can enter free-text actions.
- Suggested actions are available and do not use AI calls.
- Valid actions affect the world.
- Unsupported actions are handled clearly.
- Multi-step actions execute over time.
- NPCs respond independently to requests.

## 8.4 Environment

- Game time progresses at the configured speed.
- The simulation supports pause and fast-forward.
- The clock pauses during AI calls.
- Weather changes according to simulation rules.
- Environmental hazards produce valid consequences.
- The World Director does not force story outcomes.

## 8.5 Player Goal

- The signal fire can be built and lit only when its requirements are met.
- Weather can prevent lighting or put the fire out, according to defined rules.
- NPCs can help, compete for resources, or ignore the goal.
- The final report shows the correct outcome state.

## 8.6 Failure and Endings

- Injury and fatigue affect character abilities.
- Incapacitation prevents player actions.
- The simulation continues after player death.
- The session ends at the fixed time.
- The final report reflects recorded events without fabricated outcomes.

## 8.7 Technical Reliability

- Game state survives save and load.
- AI failures and rate limits do not corrupt world state.
- Stale AI decisions cannot overwrite newer state.
- NPC decisions are logged for debugging.
- Private knowledge is isolated between NPC requests.
- Identical initial conditions can be used for comparative tests.
- A full session stays within one day of free-tier budget.
- The API key is never visible in the webview or logs.

## 8.8 Pilot Success Criteria

The pilot is successful when at least three test sessions pass the post-session checklist below.

**Post-session checklist** (answer from play experience and the event log):

1. Did each NPC start at least one activity without player instruction?
2. Did each NPC change a plan for a reason that can be traced in the event log?
3. Did the two NPCs act noticeably differently in a similar situation?
4. Did any NPC refer to an earlier promise or event correctly?
5. Did something unexpected happen that can be explained from the event log?
6. Did any character act on information it had no valid source for? (Must be **no**.)
7. Did any narration describe a change the engine did not apply? (Must be **no**.)
8. Did the session finish within the AI budget?

A session passes when questions 6 and 7 are "no", question 8 is "yes", and at least four of questions 1 to 5 are "yes".

A dramatic story is not required for every session.

A quiet but consistent simulation is preferable to an exciting simulation that violates its own rules.

---

# 9. Open Design Details

The following details remain unapproved and should be finalized before implementation:

| Topic | Status | Open decision |
| --- | --- | --- |
| Character identities | Open | Final names, backgrounds, skills, goals, and personalities |
| Player background | Open | Fixed character or player-defined identity |
| Island layout | Proposed (Appendix A) | Routes, travel times, and starting knowledge |
| Starting conditions | Proposed (Appendix A) | Weather, shelter, character state, items |
| Signal fire | Proposed (Appendix A) | Wood, fire starter, build time, burn time, weather effects |
| Environment | Proposed (Appendix A) | Weather model and hazards; wildlife deferred |
| Health and fatigue | Proposed (Appendix A) | Thresholds and recovery; injuries deferred to Phase 2 |
| Social behavior | Open | Trust change rules and agreement handling |
| Action resolution | Proposed (Appendix A) | Physical actions; social actions open |
| AI provider | Decided | Groq free tier, gpt-oss-120b and gpt-oss-20b (7.5) |
| AI response format | Open | JSON schema for each request type |
| Budget threshold | Open | Remaining-budget level that triggers save and pause |
| Offline AI | Open | Whether fully offline models are a future goal |
| User interface | Open | Detailed screen structure and interaction flow |

These decisions should be made before detailed database schema and API design.

---

# 10. Suggested Development Sequence

This section proposes an implementation order. It does not authorize implementation.

**Phase 1 — Deterministic World**

Build the island, locations, game clock, environment, physical state, signal fire object, and validated actions without AI.

Also run a short AI gateway spike: confirm Groq limits for both models, whether their quotas are separate, and real token sizes for a sample context.

**Phase 2 — Autonomous Characters**

Add NPC profiles, goals, rule-based behavior, independent activities, and plans.

**Phase 3 — Knowledge and Memory**

Add private observations, beliefs, map knowledge, important memories, and context selection. Verify that no character can read world truth it has no source for.

This comes before AI so that every AI request is built from character knowledge from the start.

**Phase 4 — AI Decisions and Communication**

Add the Rust AI gateway, isolated NPC AI decisions, plan revisions, NPC conversations, knowledge sharing, and the call budget.

**Phase 5 — Player Experience**

Add free-text interpretation, narration, suggested actions, player journal, and game controls.

**Phase 6 — Reliability and Testing**

Add debugging tools, AI failure handling, save/load validation, fixed-duration endings, final reports, and acceptance testing with the post-session checklist.

Each phase should be tested before expanding the next.

---

## Final Design Principle

**The game should simulate a believable world first and let the story emerge second.**

Characters should be allowed to succeed, fail, cooperate, disagree, make mistakes, or do nothing remarkable.

The simulation must never secretly change reality merely to produce a better story.

---

# Appendix A: Phase 1 World Rules

## A.1 Purpose and Tuning

This appendix gives the starting values Phase 1 needs to build the deterministic world.

All numbers are first values, chosen so that one character can light the signal fire alone, but only barely. Help from NPCs should make it clearly easier.

Values change only by editing this appendix. The code reads them from one configuration file, so the spec and the code stay in sync.

Social actions, injuries, and wildlife are out of scope for Phase 1.

## A.2 Day and Night

| Period | Time |
| --- | --- |
| Daylight | 06:00 – 18:29 |
| Night | 18:30 – 05:59 |

## A.3 Island Layout

**Routes** (both directions, normal conditions):

| Route | Minutes | Notes |
| --- | --- | --- |
| Beach Camp – Forest | 20 | |
| Beach Camp – Wreckage | 30 | Along the shore |
| Forest – Cave | 25 | |
| Forest – Hilltop | 40 | Uphill |
| Cave – Hilltop | 30 | Steep; closed during Storm |

There is no direct route between Beach Camp and Hilltop.

**Travel modifiers** (multiply together; round up to the next minute):

| Condition | Multiplier |
| --- | --- |
| Night, without active flashlight | ×1.5 |
| Heavy Rain or Storm | ×1.5 |
| Tired | ×1.25 |
| Exhausted | ×1.5 |

Example: Forest to Hilltop at night, in heavy rain, while tired: 40 × 1.5 × 1.5 × 1.25 = 112.5, so 113 minutes.

A character already traveling when a route closes continues to the destination.

**Starting map knowledge** (all characters):

- Known locations: Beach Camp, Forest, Wreckage.
- Known routes: Beach Camp – Forest, Beach Camp – Wreckage.
- The hill is visible from the beach, so the Hilltop is known to exist, but no route to it is known.
- Cave is unknown.

**Explore action:**

| Where | Duration | Reveals |
| --- | --- | --- |
| Forest | 45 min | Cave, Forest – Cave route, Forest – Hilltop route |
| Cave | 30 min | Cave – Hilltop route |
| Anywhere else, or nothing left | 30 min | Nothing new |

Exploring reveals information only to the character who explored.

## A.4 Items

| Item | Found in | Carry slots | Effect |
| --- | --- | --- | --- |
| Wood bundle | Forest (unlimited) | 1 | Fuel for fire; material for shelter repair |
| Lighter | Wreckage | 0 | Lights the signal fire; 3 uses |
| Tarp | Wreckage | 1 | Adds 30 to shelter, once |
| Flashlight | Wreckage | 0 | Removes night travel penalty; 6 hours of battery |

Each character has 2 carry slots.

The lighter loses a use only when lighting succeeds.

The flashlight turns on automatically while its holder travels at night. Battery drains only during that travel time. At 0 it stops working.

## A.5 Wreckage Search

- Each search takes 30 minutes and finds one item.
- The order of the three items is set by the session seed.
- A found item lies at the Wreckage until someone takes it. Other characters at the Wreckage can see it.
- After all three items are found, a search finds nothing.

## A.6 Signal Fire

**States:**

| State | Meaning |
| --- | --- |
| None | No fire built; any wood here is a loose pile |
| Built | Fire built, not burning; has stored fuel hours |
| Lit | Burning; fuel hours decrease |

When fuel reaches 0, the state returns to None.

**Rules:**

- Building needs 6 dry wood bundles at the Hilltop and takes 60 minutes. A new fire has 4 hours of fuel.
- Adding a bundle takes 5 minutes and adds 1 hour of fuel, up to a maximum of 8 hours. Wood can be added to a Built or Lit fire.
- Lighting takes 10 minutes and needs the lighter, a Built fire, dry wood, and weather that is not Heavy Rain or Storm.
- A Lit fire uses 1 fuel hour per hour in Clear or Cloudy weather.
- In Light Rain it uses 1.5 fuel hours per hour.
- In Heavy Rain or Storm it uses 2 fuel hours per hour. If fuel falls below 2 hours during Heavy Rain or Storm, the fire goes out. It returns to Built, keeps its remaining fuel, and becomes wet.

**Wet wood:**

- Wood that is not under shelter becomes wet when weather is Light Rain or worse. This includes carried wood, loose piles, and Built fires.
- "Under shelter" means at Beach Camp with shelter at 30 or more, or in the Cave.
- Wet wood dries after 2 consecutive hours of Clear or Cloudy weather.
- Wet wood can be carried and added, but a fire containing wet wood cannot be built or lit until it dries.

## A.7 Weather

**States** (in order): Clear, Cloudy, Light Rain, Heavy Rain, Storm.

**Generation:**

- The full 48-hour sequence is rolled from the seed at session start, one state per hour.
- Each hour, the weather stays the same (80%) or moves one step (20%), up or down with equal chance.
- Clear can only move up. Storm can only move down.
- A Storm lasts at most 3 hours, then moves to Heavy Rain.
- Weather changes on the hour.

**Observe weather:** at the Hilltop, takes 15 minutes, and shows the current state and the next 2 hours truthfully. Elsewhere it shows only the current state.

## A.8 Fatigue

A hidden fatigue counter starts at 0 and never drops below 0.

| Activity | Change per minute |
| --- | --- |
| Work or travel | +1 |
| Idle, wait, or observe | +0.5 |
| Sleep at Beach Camp, shelter 30 or more | −2 |
| Sleep in the Cave | −1.5 |
| Sleep anywhere else | −1 |

| Counter | Condition | Effects |
| --- | --- | --- |
| 0 – 479 | Rested | None |
| 480 – 719 | Tired | Travel and work take ×1.25 longer |
| 720 – 959 | Exhausted | Travel ×1.5; cannot gather, build, repair, or search |
| 960 | Collapse | Falls asleep where they are, until the counter is below 480 |

"Work" means gather, build, repair, search, explore, and add wood.

## A.9 Health

Health runs from 0 to 100 and starts at 100.

- Each hour outside protection in a Storm costs 5 health. Protection means the Cave, or Beach Camp with shelter at 30 or more.
- Sleeping under protection restores 2 health per hour.
- Below 30, a character cannot gather, build, repair, or search.
- At 0, the character dies.

Injuries are added in Phase 2.

## A.10 Shelter

- The Beach Camp shelter starts at 40 out of 100.
- A repair uses 1 wood bundle, takes 60 minutes, and adds 20.
- Installing the tarp takes 30 minutes and adds 30, once.
- Each Storm hour removes 10. Each Heavy Rain hour removes 2.
- The shelter protects only at 30 or more.

## A.11 Starting Conditions

| Item | Value |
| --- | --- |
| Time | Day 1, 08:00 |
| Weather | Clear (first hour fixed; the rest rolled from the seed) |
| Characters | All at Beach Camp |
| Fatigue | 0 (Rested) |
| Health | 100 |
| Items carried | None |
| Wreckage | Lighter, tarp, flashlight, not yet found |
| Shelter | 40 |
| Signal fire | None |

## A.12 Action Table

| Action | Where | Requires | Duration | Effect |
| --- | --- | --- | --- | --- |
| Move | Any | Known route; route open | Route time × modifiers | Arrive at destination |
| Explore | Any | — | 30–45 min (A.3) | Reveal locations and routes |
| Gather wood | Forest | Free slot; not Exhausted; health 30+ | 30 min | +1 wood bundle |
| Search | Wreckage | Not Exhausted; health 30+ | 30 min | Find next item |
| Take | Any | Item here; free slot if needed | 1 min | Item to inventory |
| Drop | Any | Item carried | 1 min | Item stays at location |
| Give | Any | Other character present | 1 min | Item to other character |
| Build fire | Hilltop | 6 dry bundles here; not Exhausted | 60 min | Fire becomes Built, 4 h fuel |
| Add wood | Hilltop | Wood carried; fire Built or Lit | 5 min | +1 h fuel (max 8) |
| Light fire | Hilltop | Lighter; Built; dry; not Heavy Rain or Storm | 10 min | Fire becomes Lit |
| Repair shelter | Beach Camp | 1 bundle; not Exhausted | 60 min | Shelter +20 |
| Install tarp | Beach Camp | Tarp carried; not yet installed | 30 min | Shelter +30 |
| Observe weather | Any | — | 15 min | See weather (A.7) |
| Sleep | Any | — | Until woken or Rested | Recover fatigue and health |
| Wait | Any | — | Chosen time | Time passes |

Work durations are multiplied by ×1.25 when Tired.

An action that fails validation is rejected before it starts, costs no time, and is logged.

An action interrupted by a condition change, such as a Storm starting, stops. Partial work is lost, except for travel, which continues.

## A.13 Phase 1 Test Scenarios

Each scenario uses a fixed seed and a fixed list of player actions. Results must be the same on every run.

Test setups may set weather and search order directly, bypassing the generation rules in A.5 and A.7.

**T1: Solo fire in clear weather**

- Setup: all 48 hours Clear; search order puts the lighter first; NPCs inactive.
- Actions: get the lighter, explore the Forest, carry 6 bundles to the Hilltop in three trips, build, and light.
- Expected: fire Lit between 18:00 and 19:00 on Day 1; player Tired.

**T2: Storm effects**

- Setup: weather Clear until 14:00, then Storm from 14:00 to 17:00 on Day 1, then Clear; player stays outside at the Forest.
- Expected: Cave – Hilltop route closed during the Storm; player health 85 at 17:00; shelter 10 at 17:00 and no longer protecting; lighting is rejected during the Storm.

**T3: Fire against rain**

- Setup: fire Lit with 4 hours of fuel; Heavy Rain starts 1 hour later.
- Expected: fire uses fuel at double rate and goes out about 30 minutes after the rain starts; state returns to Built and wet with just under 2 hours of fuel.

**T4: Exhaustion**

- Setup: player travels and gathers without rest from 08:00, Day 1.
- Expected: Tired at 16:00; Exhausted at 20:00; gathering rejected after 20:00; collapse into sleep at about 00:00, Day 2.

**T5: Determinism**

- Setup: run T1 twice with the same seed and actions.
- Expected: both event logs are identical.

---

**End of MVP Game Design Specification — Draft v0.3**

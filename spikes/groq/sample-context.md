You are deciding the next action for one character in a survival simulation.
You only know what this character knows. Do not assume facts that are not
listed here. Reply with JSON only, matching the given schema.

## Who you are

Name: Mara Okafor. Age: 41.

Background: Mara worked for eleven years as a field technician for a coastal
weather station network. She is used to working alone in bad conditions, fixing
equipment with whatever is at hand, and reading the sky. She was a passenger on
the small supply boat that ran aground on the reef two days' sail from the
nearest port. She does not know the other two survivors well. She met them for
the first time on the boat.

Personality: practical, calm under pressure, slow to trust. She prefers to see
a plan written down before she agrees to it. She dislikes wasting effort and
gets irritated when people talk instead of working. She keeps her promises and
expects the same from others. She does not enjoy leading, but she will take
charge if nobody else does.

Values: self-reliance, honesty, finishing what you start, not taking more than
your share.

Skills: weather reading, basic repairs, knots and lashing, careful planning.

Weaknesses: an old knee injury makes steep climbs slow and painful; she tires
faster than she admits; she is stubborn once she has made up her mind.

Important past experience: three years ago a colleague ignored her storm warning
and was badly hurt in a fall. Since then she takes storm signs very seriously
and will drop other work to get under cover.

## Current physical state

- Time: Day 1, 15:10. Daylight. Night starts at 18:30.
- Location: Beach Camp.
- Weather now: Cloudy. The wind picked up about an hour ago. Dark clouds are
  building to the west, over the sea.
- Fatigue: Rested, but close to Tired. She has been working since 08:00 with
  only short breaks.
- Health: 100 out of 100. No injuries.
- Carrying: 1 wood bundle (dry). One carry slot is free.

## Current goals

1. Make the Beach Camp shelter strong enough to keep everyone dry if a storm
   comes tonight. (Most important to her.)
2. Find out what useful equipment is still in the wreckage of the boat.
3. Keep her own things safe and dry.

She does not know about any goal related to a signal fire. Nobody has told her
about one.

## Active plan and commitments

- Current plan (made at 12:00): gather wood in the Forest, bring it back, and
  repair the shelter until it is clearly above the safe level. Then search the
  Wreckage before dark.
- Commitment: at 13:30 she told Daniel, "If you bring wood back to camp, I will
  do the repairs." Daniel said, "Fine, I'll bring some when I can." Daniel has
  not brought any wood yet.

## What she knows about the island

- Known locations: Beach Camp, Forest, Wreckage. She can see a hill inland from
  the beach, but she does not know how to get there.
- Known routes: Beach Camp to Forest (about 20 minutes on foot), Beach Camp to
  Wreckage (about 30 minutes along the shore).
- She has not explored the Forest. She does not know what is beyond it.
- Shelter at Beach Camp: she repaired it once at about 14:00. She thinks it is
  now in fair condition, but she is not sure it would survive a long storm.
- Wreckage: she has not searched it. From the beach she saw a torn blue tarp
  caught on the hull, but she is not sure it can be pulled free.

## Relationships

- Daniel Reyes (the other survivor who is not the player): she thinks he is
  friendly but unreliable. He talks a lot about plans and has not finished any
  task she has seen. She trusts him a little less than this morning because he
  has not brought the wood he promised.
- The player character (Sam): she has spoken with Sam twice. Sam seemed
  focused and asked her what she thought about the weather. She has a neutral,
  slightly positive view of Sam. She does not know what Sam is trying to do.

## Recent observations (most recent first)

- 15:05 She noticed the wind turning and the clouds to the west getting darker.
  In her experience this often comes before heavy rain within a few hours, but
  she cannot be sure without a better view.
- 14:55 She saw Sam walk toward the Forest carrying nothing. Sam did not say
  where they were going.
- 14:20 She saw Daniel sitting near the water line, looking at the Wreckage
  from a distance. He was not working.
- 14:00 She finished one shelter repair using one wood bundle.
- 13:30 She asked Daniel to bring wood. He agreed.
- 12:40 She gathered two wood bundles in the Forest. On the way back she heard
  something large moving in the trees, but she did not see it.
- 10:15 Sam asked her, "Do you think it will rain tonight?" She said, "Maybe.
  Ask me again this afternoon."

## Recent interactions

- 13:30 Mara to Daniel: "If you bring wood back to camp, I will do the
  repairs." Daniel: "Fine, I'll bring some when I can."
- 10:15 Sam to Mara: "Do you think it will rain tonight?" Mara: "Maybe. Ask me
  again this afternoon."

## Relevant long-term memory

- She remembers the colleague who was hurt after ignoring her storm warning.
  She feels strongly that shelter comes before anything else when a storm may
  be coming.

## Actions available in the world

move, explore, gather_wood, search, take, drop, give, repair_shelter,
install_tarp, build_fire, add_wood, light_fire, observe_weather, sleep, wait,
talk. Each takes game time. Some need a specific place or item. The engine will
reject actions that are not possible, so choose something this character could
actually do from where she is, with what she carries and knows.

## Decision needed

Mara is at Beach Camp, carrying one dry wood bundle. Dark clouds are building
in the west. Daniel has not kept his promise to bring wood. Sam has gone toward
the Forest. What does Mara do next, and does she change her plan?

Answer with JSON only: the action, its target (or an empty string), a short
reason in Mara's own view, whether the plan changes, and the new plan if it
does.

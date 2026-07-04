# WardFlow: A Stateful Patient-Flow Agent for Hospital Operations

## 1. One-line concept

**WardFlow turns every patient in a hospital into a living operational agent that follows them from arrival to discharge, tracks delays and resource use, predicts the remaining timeline, and helps staff take the next best action through existing hospital software.**

---

## 2. Core idea

Hospitals do not usually fail because nobody knows a patient exists. They fail because the patient’s situation changes across many disconnected moments:

A patient arrives in the emergency department.
They wait for triage.
They get assigned a bed.
Bloodwork is ordered.
Imaging is delayed.
A cardiology consult is pending.
A telemetry bed is unavailable.
The patient is medically ready to move, but still physically occupying an ER bed.

Each of these events may be visible somewhere, but no single operational agent is continuously holding the patient’s state, understanding the delay, recalculating the timeline, and recommending action.

WardFlow is a virtual hospital operations layer where every patient has a corresponding **Patient Agent**. This agent follows the patient through the hospital journey, maintaining memory of what has happened, what is currently blocking progress, what resources have been used, and what should happen next.

The demo presents this as a visual virtual hospital: departments are shown as rooms or zones, and patient-agents move from one area to another. Staff can click any patient-agent and see their predicted timeline, delay risk, resource usage, blockers, and recommended next action.

This is not just a hospital dashboard. It is a **stateful agent system**: the key value comes from the agent remembering and updating the patient journey over time.

---

## 3. Why this fits the Google DeepMind challenge

The challenge asks for agents that do not merely act on a snapshot, such as a screenshot or transcript, but instead maintain state across a long task. WardFlow is designed exactly around that requirement.

A hospital patient journey cannot be solved from one snapshot. The system only becomes useful if it remembers the sequence:

* patient arrived at 10:05;
* triage started at 10:25;
* ECG completed at 10:42;
* labs ordered at 10:47;
* labs delayed at 11:30;
* cardiology consult requested at 12:10;
* cardiology queue became overloaded at 12:40;
* patient became medically stable at 13:20;
* discharge paperwork still pending at 14:05.

A normal chatbot could summarize the latest note. WardFlow needs to know the full evolving timeline.

The load-bearing primitive is therefore **Antigravity / Interactions API**, because it holds each Patient Agent’s persistent operational state. Without that state, the system collapses into a static dashboard.

The second primitive is **Gemini Computer Use**, which becomes useful because the first primitive is already running. When the patient-agent detects a bottleneck, a staff member can click one action, and Gemini Computer Use updates the existing hospital interface: moving the patient, marking a task done, reserving a bed, or updating a status board.

An optional third primitive is **Live Translate**, which can support multilingual patient intake. For example, a patient or family member speaks Arabic, French, Spanish, Hindi, or Swahili. The system translates the intake live, extracts operational facts, and updates the patient-agent state.

The strongest version of the primitive relationship is:

> Antigravity maintains the patient journey. Because that state exists, the agent can detect a bottleneck. Because the bottleneck is detected, Gemini Computer Use is triggered to update the hospital dashboard or queue. Live Translate can feed new patient information into the same persistent state.

---

## 4. Product vision

WardFlow is an operations copilot for hospitals.

It answers questions like:

* Which patients are likely to overstay their expected pathway?
* Which department is currently creating the largest downstream delay?
* Which patients are medically ready but operationally blocked?
* Which patients are using scarce resources without receiving active care?
* Which single action would free the most capacity right now?
* What changed since the previous shift?
* Where will the next bottleneck appear?

The vision is not to replace doctors or nurses. WardFlow is not making clinical diagnoses. It is focused on operational flow: time, queues, resources, bottlenecks, handoffs, and next actions.

---

## 5. Demo framing

The demo should look like a small, animated virtual hospital.

The user starts at a screen called:

**Hospital One**

Inside, they see departments:

* Emergency Department
* Triage
* Radiology
* Laboratory
* Cardiology
* Psychiatry
* ICU
* Observation Unit
* Discharge Lounge

Small patient-agents move between departments. Each patient-agent has a name and status.

Example:

**Sarah Agent**
Chest pain, stable, cardiology pending.

**Omar Agent**
Shortness of breath, imaging delayed.

**Maya Agent**
Psych evaluation pending, no safe room available.

**Jean Agent**
Medically ready, discharge paperwork pending.

Each agent is visible as a cute animated icon or small robot avatar. The animation is not just aesthetic: it makes the stateful journey visible.

When the user clicks a patient-agent, a detailed patient-flow panel opens.

---

## 6. Patient-agent card

Each patient-agent card should show the following:

### Patient summary

Name: Sarah M.
Age: 58
Initial complaint: chest pain
Current department: Emergency Department
Current status: stable
Current pathway: chest pain rule-out pathway
Assigned priority: high but non-critical

### Predicted timeline

Expected ER exit: 16:20
Current prediction: 18:05
Delay: +1h 45m
Delay risk: high

### Journey so far

Arrival: 10:05
Triage: 10:22
ECG: 10:38
Labs ordered: 10:45
Labs completed: 11:50
Imaging completed: 12:25
Cardiology consult requested: 12:35
Current blocker: waiting for cardiology review

### Resources used

ER bed: 3h 40m
Nurse time: 42m
Doctor time: 22m
Lab panel: 1
ECG: 1
Imaging slot: 1
Cardiology consult: pending
Observation bed: not yet assigned

### Efficiency analysis

Expected pathway time: 4h 00m
Current elapsed time: 5h 15m
Operational overstay: 1h 15m
Clinical blocker: none active
Operational blocker: cardiology queue + no observation bed assigned

### Recommended next action

Move Sarah to Observation Unit and escalate cardiology review.

Expected impact:

* frees ER bed within 15 minutes;
* reduces ER congestion;
* keeps patient monitored while waiting for consult;
* reduces projected discharge time by 45 minutes.

### Action button

**Resolve delay**

When clicked, Gemini Computer Use opens the simulated hospital dashboard and updates the patient’s status:

* moves Sarah from ER to Observation;
* marks “awaiting cardiology” as escalated;
* reserves an observation bed;
* updates the operational board.

The patient-agent then physically moves on the virtual map.

---

## 7. The patient journey flow

The central visual concept should be the patient journey:

**Arrival → Triage → ER Bed → Labs → Imaging → Specialist Consult → Observation → Discharge**

At each node, the system compares expected vs actual performance.

Example:

### Arrival

Expected wait: 5 minutes
Actual wait: 4 minutes
Status: efficient

### Triage

Expected time: 15 minutes
Actual time: 18 minutes
Status: acceptable

### ER Bed

Expected time: 90 minutes
Actual time: 145 minutes
Status: delayed

### Labs

Expected turnaround: 45 minutes
Actual turnaround: 65 minutes
Status: delayed

### Cardiology

Expected wait: 30 minutes
Actual wait: 100 minutes and counting
Status: critical bottleneck

### Discharge

Not reached yet.

This visual flow makes the statefulness obvious. The agent is not reacting to a single moment. It is interpreting the whole pathway.

---

## 8. The main demo story

The demo can follow one patient from start to finish.

### Scene 1: Patient arrives

Sarah arrives at Hospital One with chest pain. The intake creates a new Patient Agent.

Initial prediction:

> Sarah is expected to exit the ER in 4 hours and 10 minutes if labs, imaging, and cardiology review happen within normal timing.

The agent appears in the ER area.

### Scene 2: Triage and initial tests

Sarah moves to triage. Her ECG is completed. Labs are ordered.

The agent updates:

> ECG completed. Labs pending. Current pathway remains on track.

The map shows Sarah moving from triage to ER bed.

### Scene 3: Lab delay

The lab queue becomes overloaded. Sarah’s bloodwork takes longer than expected.

Prediction changes:

> Expected ER exit changed from 14:20 to 15:05. Primary delay source: laboratory turnaround.

The agent’s card shows a yellow delay warning.

### Scene 4: Cardiology bottleneck

Cardiology consult is requested, but Cardiology is overloaded. Several patient-agents are waiting there.

Prediction changes again:

> Expected ER exit changed from 15:05 to 16:50. Primary delay source: cardiology consult queue.

The virtual hospital map now shows a visible cluster of patients near Cardiology.

### Scene 5: The agent recommends action

WardFlow surfaces a plain-language recommendation:

> Sarah is stable and no longer needs an ER bed while waiting for cardiology. Move to Observation Unit and escalate cardiology consult. This frees one ER bed and reduces projected delay by 45 minutes.

The user clicks:

**Resolve delay**

### Scene 6: Gemini Computer Use acts

Gemini Computer Use opens the simulated hospital dashboard and performs the operational update:

* changes Sarah’s department from ER to Observation;
* marks cardiology consult as escalated;
* assigns observation bed O-12;
* updates the ER bed board.

Back in the virtual map, Sarah’s agent moves from ER to Observation.

### Scene 7: System-level insight

WardFlow then shows a hospital-wide insight:

> Cardiology is now the main bottleneck. Four patients are waiting for consults. Reassigning one cardiologist for the next hour would reduce total projected patient overstay by 3h 20m.

This turns the demo from a single-patient story into a hospital operations story.

---

## 9. Why the “patient-agent” metaphor matters

The patient-agent metaphor is powerful because it makes the invisible operational state tangible.

In a hospital, the patient’s journey is fragmented across systems:

* intake system;
* EHR;
* bed board;
* lab system;
* imaging queue;
* specialist consult queue;
* discharge system.

WardFlow creates one continuous representation.

The patient-agent is not a doctor. It is a stateful operational representative of the patient’s journey.

It tracks:

* where the patient is;
* where they came from;
* where they need to go next;
* what has already been done;
* what is still pending;
* what is blocking progress;
* which resources have been consumed;
* what is likely to happen next.

This is exactly the kind of use case where memory and long-running state are essential.

---

## 10. Core primitives

### Primitive 1: Antigravity / Interactions API

This is the main primitive.

Each patient-agent is a long-running stateful entity. It stores the patient’s evolving operational timeline.

Example state:

```json
{
  "patient_id": "P-1042",
  "agent_name": "Sarah Agent",
  "current_department": "Emergency",
  "pathway": "Chest Pain Rule-Out",
  "arrival_time": "10:05",
  "events": [
    {
      "time": "10:05",
      "type": "arrival",
      "department": "Emergency"
    },
    {
      "time": "10:22",
      "type": "triage_completed",
      "department": "Triage"
    },
    {
      "time": "10:38",
      "type": "ecg_completed",
      "department": "Emergency"
    },
    {
      "time": "12:35",
      "type": "cardiology_consult_requested",
      "department": "Cardiology"
    }
  ],
  "pending_tasks": [
    "cardiology_review",
    "observation_bed_assignment"
  ],
  "resources_used": {
    "er_bed_minutes": 220,
    "nurse_minutes": 42,
    "doctor_minutes": 22,
    "lab_tests": 1,
    "imaging_slots": 1
  },
  "predicted_exit_time": "18:05",
  "delay_risk": "high",
  "current_blocker": "cardiology_queue"
}
```

Without this persistent state, the system could not understand whether Sarah is delayed, why she is delayed, or what action would help.

### Primitive 2: Gemini Computer Use

This primitive acts on the existing hospital interface.

In the demo, it can operate a simulated EHR or hospital operations dashboard. It can:

* move a patient between departments;
* mark a task as completed;
* update a bed board;
* reserve a bed;
* escalate a consult;
* add a note to the operational log.

This makes the system feel like an actual agent, not just an analytics panel.

The important relationship is:

> Gemini Computer Use is triggered by the stateful patient-agent. The second primitive fires because the first primitive has detected a meaningful state transition or bottleneck.

### Optional Primitive 3: Live Translate

Live Translate can make the demo stronger if the team has time.

A multilingual intake moment could work like this:

A patient’s family member speaks Spanish or Arabic. The agent translates the conversation live, extracts relevant operational details, and updates the patient-agent state.

Example:

Patient’s daughter says in Spanish:

> She has had chest pain for two hours and took aspirin before arriving.

Live Translate converts this into English, and the patient-agent state updates:

* symptom duration: 2 hours;
* medication taken: aspirin;
* urgency: chest pain pathway;
* next question: ask about shortness of breath.

This would show that the patient-agent is not just receiving form data. It can be fed by live human conversation.

---

## 11. What the prediction should mean

The prediction should not be framed as a clinical prediction of survival or diagnosis. That would be risky and too medically complex for a hackathon demo.

Instead, frame it as an operational prediction:

* predicted time to next step;
* predicted time to ER exit;
* predicted time to admission;
* predicted time to discharge;
* probability of delay;
* likely bottleneck;
* expected resource use.

Good prediction labels:

* “Expected ER exit”
* “Delay risk”
* “Operational overstay”
* “Projected discharge window”
* “Current bottleneck”
* “Resource load”

Avoid overclaiming with labels like:

* “survival prediction”;
* “diagnosis prediction”;
* “medical decision”;
* “doctor replacement.”

The safest and clearest positioning is:

> WardFlow does not decide medical care. It helps hospital teams see and reduce operational delays.

---

## 12. Resource tracking

The demo should make resources concrete.

Each patient-agent can track:

### Human resources

* nurse time;
* doctor time;
* specialist consults;
* admin time;
* interpreter time, if Live Translate is used.

### Physical resources

* ER bed;
* observation bed;
* ICU bed;
* imaging room;
* lab capacity;
* transport staff;
* discharge lounge seat.

### Diagnostic resources

* blood panel;
* ECG;
* X-ray;
* CT;
* ultrasound;
* psychiatric assessment;
* cardiology consult.

### Time resources

* total time in hospital;
* time in current department;
* waiting time;
* active-care time;
* avoidable delay time.

The most interesting metric is not just “time spent.” It is the difference between:

**medically necessary time** and **operationally wasted time**.

Example:

> Sarah has spent 5h 15m in the ER. Of that, 3h 40m was active pathway time and 1h 35m was avoidable operational delay.

---

## 13. Efficiency and bottleneck logic

WardFlow should classify delay causes.

Possible blocker types:

* waiting for triage;
* waiting for bed;
* waiting for labs;
* waiting for imaging;
* waiting for specialist consult;
* waiting for transport;
* waiting for discharge paperwork;
* waiting for family pickup;
* no downstream bed available;
* staff shortage;
* unclear next step.

The agent should produce plain-language explanations.

Bad explanation:

> Queue pressure coefficient increased by 0.72.

Good explanation:

> Sarah is medically stable but waiting in the ER because Cardiology has not reviewed her yet. Moving her to Observation would free one ER bed without interrupting care.

The hackathon demo should prioritize clarity over sophisticated modeling.

---

## 14. Hospital-wide view

The hospital map should have two levels:

### Patient-level view

Click one patient-agent and see:

* timeline;
* resources used;
* blockers;
* predicted exit;
* next best action.

### System-level view

Click one department and see:

* current load;
* number of waiting patients;
* average delay;
* most common blocker;
* projected overload risk;
* recommended staffing or routing action.

Example Cardiology department card:

Current queue: 5 patients
Average consult wait: 92 minutes
Expected wait: 30 minutes
Overload risk: high
Downstream impact: 4 ER beds blocked
Recommended action: assign one additional cardiologist for 60 minutes

This allows the demo to show both individual patient flow and hospital resource allocation.

---

## 15. MVP scope for hackathon

The MVP should not try to build a real hospital system. It should simulate enough to show the primitive clearly.

### Build these screens

1. **Hospital map**

   * departments as zones;
   * animated patient-agents moving between them;
   * department load indicators.

2. **Patient-agent detail panel**

   * timeline;
   * prediction;
   * resource use;
   * delay explanation;
   * next action.

3. **Event simulator**

   * buttons or scripted events:

     * lab delayed;
     * cardiology overloaded;
     * bed becomes available;
     * patient moved;
     * discharge paperwork completed.

4. **Action execution**

   * one-tap action:

     * move patient;
     * escalate consult;
     * assign bed.
   * Gemini Computer Use performs this in a simulated dashboard.

5. **Agent memory**

   * Antigravity holds patient state across multiple interactions.
   * The patient-agent persists across the demo, rather than being regenerated from a screenshot.

### Nice-to-have

* Live Translate intake;
* shift-change summary;
* hospital-wide bottleneck forecast;
* multiple hospitals;
* department-to-department resource reallocation.

---

## 16. Example demo script

### Opening

“Most hospital AI tools look at a snapshot: a note, a chart, a queue, a bed board. But hospital delays happen across time. WardFlow gives every patient a stateful operational agent that follows them from arrival to discharge.”

### Step 1

Show Hospital One.

“Here is our virtual hospital. Each moving icon is a patient-agent. The agent holds that patient’s operational state.”

### Step 2

Click Sarah Agent.

“Sarah came in with chest pain. The agent knows her full timeline: arrival, triage, ECG, labs, imaging, and pending cardiology review.”

### Step 3

Trigger lab delay.

“Now labs are delayed. The agent recalculates her expected ER exit and updates the cause of delay.”

### Step 4

Trigger cardiology overload.

“Cardiology becomes the bottleneck. Sarah is now projected to overstay by 1 hour and 45 minutes.”

### Step 5

Show recommendation.

“The agent explains that Sarah is stable and does not need to occupy an ER bed while waiting for cardiology. It recommends moving her to Observation.”

### Step 6

Click Resolve.

“With one tap, Gemini Computer Use updates the hospital dashboard: Sarah moves to Observation, the consult is escalated, and the ER bed is freed.”

### Step 7

Show system insight.

“Because every patient has a stateful agent, WardFlow can now see that Cardiology is blocking four ER beds. It recommends assigning one additional cardiologist for the next hour.”

### Closing

“WardFlow is not a chatbot on top of a dashboard. It is a living agent layer for hospital flow. The agent cannot work from a snapshot. It needs persistent state, and that is why Antigravity is load-bearing.”

---

## 17. Naming options

Possible names:

* WardFlow
* HospitOS
* CareMap AI
* PatientFlow Agents
* ER-to-Exit
* FlowMD
* CareRoute
* Hospital Ant Farm
* BedFlow
* PulseOps

Best serious name: **WardFlow**
Best playful demo name: **Hospital Ant Farm**
Best enterprise name: **CareMap AI**

---

## 18. What makes this project compelling

This project is strong because it combines:

1. **A clear operational problem**
   Hospitals lose time and capacity because patient flow is fragmented.

2. **A strong visual metaphor**
   Patient-agents physically move through a virtual hospital.

3. **A real need for statefulness**
   The system is useless if it forgets the patient journey.

4. **A clear use of Google primitives**
   Antigravity holds the long-running state. Gemini Computer Use acts on hospital software. Live Translate can feed multilingual intake.

5. **A good demo moment**
   The patient gets delayed, the agent detects why, the user clicks resolve, the dashboard updates, and the patient moves.

6. **A safe framing**
   It avoids claiming to diagnose or replace clinicians. It focuses on operations, resources, and delays.

---

## 19. Risks and how to handle them

### Risk 1: It sounds like a medical diagnosis product

Solution: Reframe constantly as hospital operations.

Use:

> operational delay prediction

Not:

> medical outcome prediction

Use:

> expected time to next step

Not:

> survival prediction

### Risk 2: The scope is too broad

Solution: Demo one department flow: Emergency → Labs → Cardiology → Observation → Discharge.

Do not build the whole hospital. Simulate the hospital.

### Risk 3: The AI primitive looks decorative

Solution: Make Antigravity central.

The demo should show that the agent remembers previous events and updates predictions because of them.

### Risk 4: Gemini Computer Use looks unnecessary

Solution: Make the action button actually drive a visible dashboard update.

The user should see Gemini Computer Use click through a simulated hospital interface, not just pretend an action happened.

### Risk 5: Too many metrics

Solution: Focus on five:

* expected exit time;
* delay risk;
* current blocker;
* resources used;
* next best action.

---

## 20. Final product statement

WardFlow is a stateful hospital operations agent system. Every patient becomes a living patient-agent that follows their journey through the hospital, remembers each event, tracks resource use, detects bottlenecks, predicts remaining time, and recommends the next operational action.

The demo shows a virtual hospital where patient-agents move from department to department. Staff can click any agent to see its timeline, current delay, resources consumed, and recommended action. When an action is approved, Gemini Computer Use updates the simulated hospital dashboard directly.

The project is designed around the idea that hospital flow cannot be solved from a snapshot. It requires persistent memory, state transitions, and action across systems. That makes Antigravity the load-bearing primitive and Gemini Computer Use the action layer triggered by that state.

WardFlow is not a replacement for doctors. It is an operational nervous system for the hospital.

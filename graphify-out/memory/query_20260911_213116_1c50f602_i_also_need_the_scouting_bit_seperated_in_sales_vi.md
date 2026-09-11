---
type: "query"
date: "2026-09-11T21:31:16.059031+00:00"
question: "i also need the scouting bit seperated in sales view thing for me please scouting as a seperate sidebar thing for it please i also need a google maps iframe embedd so i can find scout businessesses on my radar then see their profiles and then create a contact of that google business map profile and then i can create contact then put them into the scouting basically scouting qualifying then i want to do the action to get them signed on basically thats the missing flow not sure if this can be done without interupting claude but i need this in sales its really important for journey i need to be able to find scout for the business make them a lead cintact do a bit of research myself eg google about them get their profiles linked for some research add some notes then i can choose to cold call email ect convert then meetings ect this is the flow i really need and the security workspace needs to be in dev mode for the agency dev mode please as that dev mode is app dev mode please"
contributor: "graphify"
outcome: "useful"
source_nodes: ["SCOUTING", "_LeadsPipelineWorkspace.tsx", "_ScoutingCommand.tsx", "Sidebar()", "Security hardening plan", "meetings/page.tsx"]
---

# Q: i also need the scouting bit seperated in sales view thing for me please scouting as a seperate sidebar thing for it please i also need a google maps iframe embedd so i can find scout businessesses on my radar then see their profiles and then create a contact of that google business map profile and then i can create contact then put them into the scouting basically scouting qualifying then i want to do the action to get them signed on basically thats the missing flow not sure if this can be done without interupting claude but i need this in sales its really important for journey i need to be able to find scout for the business make them a lead cintact do a bit of research myself eg google about them get their profiles linked for some research add some notes then i can choose to cold call email ect convert then meetings ect this is the flow i really need and the security workspace needs to be in dev mode for the agency dev mode please as that dev mode is app dev mode please

## Answer

Implemented a dedicated permission-governed Sales Scouting workspace and sidebar route, brokered Google Places search plus restricted Maps embed, Place ID-only provider persistence, prospect dossier research/notes/outreach/qualification handoff, recipient-bound contact safety, Journey data isolation, active-tenant pinning, and founder Security placement in App Dev Mode. Focused acceptance passed 212/212 and the production build passed. Browser/live Google/legal/full-suite external gates remain pending. Expanded tokens: sales, scouting, sidebar, google, business, contact, lead, pipeline, notes, meeting, security, workspace.

## Outcome

- Signal: useful

## Source Nodes

- SCOUTING
- _LeadsPipelineWorkspace.tsx
- _ScoutingCommand.tsx
- Sidebar()
- Security hardening plan
- meetings/page.tsx
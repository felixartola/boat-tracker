# Boat GPS Tracker

## Project context
- Built by an intern on behalf of a city department. The goal is to let
  inspectors track the paths they travel more efficiently.
- The intern reports to an internship director, who approves major decisions.
- Data is stored and displayed in ArcGIS Online: points go to the `boat_gps`
  hosted feature layer and trip lines to `boat_tracks`. The map is an ArcGIS
  web map. Users sign in with ArcGIS OAuth.
- The site is plain `index.html` + `style.css` with no build step. The user
  copies files from GitHub into a local editor and runs them on a local server,
  so remind them to hard refresh (Ctrl+F5) after CSS changes.

## Working rule: flag fundamental changes before making them
Before making any change to how the site fundamentally works, stop and tell
the user first, so they can get approval from their internship director.
Examples:
- changing how or where data is stored (layers, schemas, new services)
- changing sign-in, user accounts, permissions or who can see what data
- adding a backend, database or third-party service
- splitting the site into separate versions or restructuring the app
- anything that changes what inspectors' existing data looks like

Small fixes, styling and features built on the existing design can go ahead
normally.

## Planned direction (not approved yet)
- A regular-user version and a developer version. Users sign in and see only
  their own path history, and new paths are tagged with a unique user ID.
- Leaning toward doing this in ArcGIS: editor tracking (automatic `Creator`
  field) plus ownership-based access control on the hosted layers, and an
  ArcGIS group to identify developers, all within one site rather than two.
- Pending: the internship director's approval of the ArcGIS approach.

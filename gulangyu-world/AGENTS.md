# Gulangyu environment project

This directory contains a map-constrained Blender environment prototype, not a surveyed digital twin or a configured game.

- Use `README.md` for the build pipeline and delivery contract.
- Use `delivery/ACCURACY.json` and the README accuracy table for provenance. Ordinary facade details and building heights are inferred; no building in this snapshot has an explicit OSM height tag.
- `data/osm.json` and the DEM PNGs are retained source inputs. `data/geo.json` is the processed scene layout. Do not replace real coastline or footprint data with an arbitrary island layout.
- Preserve OpenStreetMap attribution and the terrain-source references when distributing derivatives.
- `delivery/Gulangyu_World.blend` is generated. Keep manual revisions in a new `.blend` file before rebuilding.
- `scripts/build_scene.py`, `conform_roads.py`, `road_boundaries.py`, and `lod_assets.py` define the current geometry. Reproduce the preprocessing steps in README before rebuilding.
- Validate changed GLBs with `scripts/validate_delivery.py` and use `scripts/check_roundtrip.py` for a glTF reimport check. `delivery/VALIDATION.json` records actual checks; do not claim Unity or Unreal runtime validation unless it is performed.
- Cinematic ocean/sky and the disabled mainland backdrop are separate from the exported game environment. The separate collision file contains static terrain/building proxies, not an implemented navigation or character system.

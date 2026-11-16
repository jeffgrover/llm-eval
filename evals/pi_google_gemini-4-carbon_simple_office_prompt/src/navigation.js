import { BUILDING } from './config.js';

export class BuildingNavigator {
  constructor() {
    this.graphs = [];
    for (let f = 0; f < BUILDING.numFloors; f++) {
      this.graphs.push(this._buildFloorGraph(f));
    }
  }

  _buildFloorGraph(floor) {
    const nodes = new Map();
    const edges = new Map();

    const addNode = (id, x, z) => {
      nodes.set(id, { id, x, z });
      if (!edges.has(id)) edges.set(id, []);
    };

    const connect = (a, b) => {
      const na = nodes.get(a);
      const nb = nodes.get(b);
      if (!na || !nb) return;
      const dist = Math.hypot(na.x - nb.x, na.z - nb.z);
      edges.get(a).push({ to: b, cost: dist });
      edges.get(b).push({ to: a, cost: dist });
    };

    if (floor === 0) {
      // Outdoor arrival & plaza nodes
      addNode('street_w', -28, 28.5);
      addNode('street_e', 28, 28.5);
      addNode('crosswalk', 0, 27.5);
      addNode('plaza_mid', 0, 19.5);
      addNode('patio_entry', 9.0, 19.5);
      addNode('door_out', 0, 12.4);
      addNode('door_in', 0, 9.6);

      // Turnstile lanes (Z = 5.2)
      addNode('vestibule', 0, 7.2);
      addNode('turn_w', -1.6, 5.2);
      addNode('turn_c', 0.0, 5.2);
      addNode('turn_e', 1.6, 5.2);
      addNode('atrium_s', 0, 3.0);
      addNode('atrium_n', 0, -1.5);

      // Spine in front of elevators & stairwell
      addNode('spine_stair', -6.5, -4.8);
      addNode('spine_el_w', -3.2, -4.8);
      addNode('spine_el_c', 0.0, -4.8);
      addNode('spine_el_e', 3.2, -4.8);
      addNode('spine_w', -10.0, -4.2);
      addNode('spine_e', 9.5, -4.2);

      // Lobby West Lounge & East Cafe
      addNode('lounge_entry', -10.0, 2.5);
      addNode('reception_front', -3.4, 3.2);
      addNode('cafe_entry', 9.5, 2.2);
      addNode('cafe_north', 10.5, -1.2);

      connect('street_w', 'crosswalk');
      connect('street_e', 'crosswalk');
      connect('crosswalk', 'plaza_mid');
      connect('plaza_mid', 'patio_entry');
      connect('plaza_mid', 'door_out');
      connect('door_out', 'door_in');
      connect('door_in', 'vestibule');

      connect('vestibule', 'turn_w');
      connect('vestibule', 'turn_c');
      connect('vestibule', 'turn_e');
      connect('turn_w', 'atrium_s');
      connect('turn_c', 'atrium_s');
      connect('turn_e', 'atrium_s');

      connect('atrium_s', 'reception_front');
      connect('atrium_s', 'lounge_entry');
      connect('atrium_s', 'cafe_entry');
      connect('atrium_s', 'atrium_n');

      connect('atrium_n', 'spine_el_c');
      connect('atrium_n', 'spine_el_w');
      connect('atrium_n', 'spine_el_e');
      connect('spine_stair', 'spine_el_w');
      connect('spine_el_w', 'spine_el_c');
      connect('spine_el_c', 'spine_el_e');
      connect('spine_w', 'spine_stair');
      connect('spine_w', 'lounge_entry');
      connect('spine_el_e', 'spine_e');
      connect('spine_e', 'cafe_north');
      connect('cafe_north', 'cafe_entry');

      return { nodes, edges };
    }

    if (floor === 4) {
      // Rooftop Pavilion + Sky Garden Terrace
      addNode('spine_stair', -6.5, -4.8);
      addNode('spine_el_w', -3.2, -4.8);
      addNode('spine_el_c', 0.0, -4.8);
      addNode('spine_el_e', 3.2, -4.8);
      addNode('pav_w', -11.5, -4.5);
      addNode('pav_sw', -11.5, 1.5);
      addNode('pav_c', -3.5, 0.5);
      addNode('pav_se', 1.8, 1.5);

      // Two doorways out onto the Sky Terrace (pavilion glass walls at X=5.2 and Z=5.2)
      addNode('deck_door_e_in', 4.2, -1.5);
      addNode('deck_door_e_out', 6.6, -1.5);
      addNode('deck_door_s_in', -2.0, 4.2);
      addNode('deck_door_s_out', -2.0, 6.6);

      // Outdoor terrace walkways
      addNode('deck_ne', 10.5, -5.5);
      addNode('deck_ce', 10.5, 0.5);
      addNode('deck_se', 10.5, 7.2);
      addNode('deck_sc', 3.5, 7.8);
      addNode('deck_sw', -10.5, 7.8);

      connect('spine_stair', 'spine_el_w');
      connect('spine_el_w', 'spine_el_c');
      connect('spine_el_c', 'spine_el_e');
      connect('pav_w', 'spine_stair');
      connect('pav_w', 'pav_sw');
      connect('pav_sw', 'pav_c');
      connect('spine_el_c', 'pav_c');
      connect('pav_c', 'pav_se');
      connect('spine_el_e', 'deck_door_e_in');
      connect('pav_se', 'deck_door_e_in');
      connect('deck_door_e_in', 'deck_door_e_out');
      connect('pav_c', 'deck_door_s_in');
      connect('deck_door_s_in', 'deck_door_s_out');

      connect('deck_door_e_out', 'deck_ne');
      connect('deck_door_e_out', 'deck_ce');
      connect('deck_ce', 'deck_ne');
      connect('deck_ce', 'deck_se');
      connect('deck_se', 'deck_sc');
      connect('deck_sc', 'deck_door_s_out');
      connect('deck_door_s_out', 'deck_sw');

      return { nodes, edges };
    }

    // Standard Office Floors 1, 2, 3 — clean orthogonal spine + 3 aisles
    const spineXs = [-14.5, -9.6, -6.5, -3.2, 0.0, 3.2, 6.8, 9.4, 13.5];
    spineXs.forEach((sx, i) => {
      addNode(`sp_${i}`, sx, -4.6);
      if (i > 0) connect(`sp_${i - 1}`, `sp_${i}`);
    });

    // West aisle (X = -9.6), Center aisle (X = 0.0), East aisle (X = 9.4)
    const aisleZs = [-1.5, 2.2, 5.5, 8.6];
    aisleZs.forEach((az, j) => {
      addNode(`aw_${j}`, -9.6, az);
      addNode(`ac_${j}`, 0.0, az);
      addNode(`ae_${j}`, 9.4, az);

      if (j === 0) {
        connect('sp_1', 'aw_0');
        connect('sp_4', 'ac_0');
        connect('sp_7', 'ae_0');
      } else {
        connect(`aw_${j - 1}`, `aw_${j}`);
        connect(`ac_${j - 1}`, `ac_${j}`);
        connect(`ae_${j - 1}`, `ae_${j}`);
      }
    });

    // South promenade connecting West, Center, East aisles at Z = 8.6
    connect('aw_3', 'ac_3');
    connect('ac_3', 'ae_3');

    // Phone booth vestibule approach at (7.7, -6.5)
    addNode('booth_hall', 7.7, -6.5);
    connect('sp_6', 'booth_hall');
    connect('sp_7', 'booth_hall');

    return { nodes, edges };
  }

  /**
   * Computes a smooth collision-free waypoint list [{x, z}, ...] on a single floor.
   * Optional entryGate / exitGate force routing through room doorways!
   */
  findFloorPath(floor, startX, startZ, endX, endZ, startGate = null, endGate = null) {
    const g = this.graphs[floor];
    if (!g) return [{ x: endX, z: endZ }];

    const p0x = startGate ? startGate.x : startX;
    const p0z = startGate ? startGate.z : startZ;
    const p1x = endGate ? endGate.x : endX;
    const p1z = endGate ? endGate.z : endZ;

    // Very short walk inside the same open area without crossing room boundaries
    if (!startGate && !endGate && Math.hypot(endX - startX, endZ - startZ) < 2.6) {
      return [{ x: endX, z: endZ }];
    }

    const startNodeId = this._nearestNode(g, p0x, p0z);
    const endNodeId = this._nearestNode(g, p1x, p1z);

    const pts = [];
    if (startGate) {
      pts.push({ x: startGate.x, z: startGate.z });
    }

    const nodeChain = this._dijkstra(g, startNodeId, endNodeId);
    for (const nid of nodeChain) {
      const n = g.nodes.get(nid);
      pts.push({ x: n.x, z: n.z });
    }

    if (endGate) {
      pts.push({ x: endGate.x, z: endGate.z });
    }
    pts.push({ x: endX, z: endZ });

    // Prune redundant tiny zig-zags at start/end
    return this._simplifyWaypoints(startX, startZ, pts);
  }

  _nearestNode(graph, x, z) {
    let bestId = null;
    let bestD = Infinity;
    for (const [id, n] of graph.nodes.entries()) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    }
    return bestId;
  }

  _dijkstra(graph, sourceId, targetId) {
    if (!sourceId || !targetId) return [];
    if (sourceId === targetId) return [sourceId];

    const dist = new Map();
    const prev = new Map();
    const unvisited = new Set();

    for (const id of graph.nodes.keys()) {
      dist.set(id, Infinity);
      unvisited.add(id);
    }
    dist.set(sourceId, 0);

    while (unvisited.size > 0) {
      let u = null;
      let best = Infinity;
      for (const id of unvisited) {
        const d = dist.get(id);
        if (d < best) {
          best = d;
          u = id;
        }
      }
      if (u === null || u === targetId) break;
      unvisited.delete(u);

      for (const edge of graph.edges.get(u) || []) {
        if (!unvisited.has(edge.to)) continue;
        const alt = best + edge.cost;
        if (alt < dist.get(edge.to)) {
          dist.set(edge.to, alt);
          prev.set(edge.to, u);
        }
      }
    }

    const path = [];
    let curr = targetId;
    while (curr) {
      path.unshift(curr);
      if (curr === sourceId) break;
      curr = prev.get(curr);
    }
    return path;
  }

  _simplifyWaypoints(sx, sz, pts) {
    if (pts.length <= 1) return pts;
    const out = [];
    let prevX = sx;
    let prevZ = sz;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (Math.hypot(p.x - prevX, p.z - prevZ) > 0.25 || i === pts.length - 1) {
        out.push(p);
        prevX = p.x;
        prevZ = p.z;
      }
    }
    return out;
  }

  /**
   * Generates 3D waypoints up or down the architectural dog-leg stairwell.
   */
  getStairPath3D(fromFloor, toFloor) {
    const fh = BUILDING.floorHeight;
    const pts = [];
    const stepDir = toFloor > fromFloor ? 1 : -1;

    let f = fromFloor;
    while (f !== toFloor) {
      const nextF = f + stepDir;
      const lowF = Math.min(f, nextF);
      const yLow = lowF * fh;
      const yMid = yLow + fh * 0.5;
      const yHigh = (lowF + 1) * fh;

      if (stepDir === 1) {
        // Ascending: West flight (-7.15) up to north mid-landing, then East flight (-5.85) up to next floor
        pts.push({ x: -7.15, y: yLow, z: -6.75 });
        pts.push({ x: -7.15, y: yMid, z: -9.25 });
        pts.push({ x: -5.85, y: yMid, z: -9.25 });
        pts.push({ x: -5.85, y: yHigh, z: -6.75 });
        pts.push({ x: -6.5, y: yHigh, z: -6.2 });
      } else {
        // Descending: reverse
        pts.push({ x: -5.85, y: yHigh, z: -6.75 });
        pts.push({ x: -5.85, y: yMid, z: -9.25 });
        pts.push({ x: -7.15, y: yMid, z: -9.25 });
        pts.push({ x: -7.15, y: yLow, z: -6.75 });
        pts.push({ x: -6.5, y: yLow, z: -6.2 });
      }
      f = nextF;
    }
    return pts;
  }
}

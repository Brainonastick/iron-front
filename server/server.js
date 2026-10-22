const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 16;
const TEAM_SIZE = 8;

// ===== ORIGINAL CLASSES =====
const CLASSES = {
  rifleman: {
    name: 'Rifleman',
    health: 100,
    speed: 1.0,
    primary: 'rifle',
    secondary: 'pistol',
    special: null
  },
  support: {
    name: 'Support',
    health: 110,
    speed: 0.9,
    primary: 'lmg',
    secondary: 'pistol',
    special: 'deploy_lmg'
  },
  marksman: {
    name: 'Marksman',
    health: 90,
    speed: 0.95,
    primary: 'scoped_rifle',
    secondary: 'pistol',
    special: null
  },
  engineer: {
    name: 'Engineer',
    health: 100,
    speed: 1.0,
    primary: 'smg',
    secondary: 'pistol',
    special: 'charge'
  },
  medic: {
    name: 'Medic',
    health: 100,
    speed: 1.05,
    primary: 'smg',
    secondary: 'pistol',
    special: 'heal'
  }
};

const WEAPONS = {
  rifle:        { damage: 34, fireRate: 400, spread: null, spread: 0.02 },
  lmg:          { damage: 28, fireRate: 120, range: null, spread: 0.04 },
  scoped_rifle: { damage: 70, fireRate: 900, range: null, spread: 0.005 },
  smg:          { damage: 22, fireRate: 90,  range: null, spread: 0.05 },
  pistol:       { damage: 25, fireRate: 250, range: null, spread: 0.03 },
  deployed_lmg: { damage: 32, fireRate: 100, range: null, spread: 0.015 }
};

app.use(express.static(path.join(__dirname, '../public')));

const rooms = new Map();

function createRoom(roomId) {
  return {
    id: roomId,
    players: new Map(),
    teams: { blue: [], red: [] },
    scores: { blue: 0, red: 0 },
    deployedLmgs: new Map()
  };
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }
  return rooms.get(roomId);
}

function assignTeam(room) {
  if (room.teams.blue.length <= room.teams.red.length && room.teams.blue.length < TEAM_SIZE) {
    return 'blue';
  }
  if (room.teams.red.length < TEAM_SIZE) {
    return 'red';
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('Player connected: ' + socket.id);

  let currentRoom = null;
  let playerData = null;

  socket.on('join', (data) => {
    const roomId = data.roomId || 'default';
    const name = (data.name || 'Soldier').substring(0, 16);
    const classId = CLASSES[data.classId] ? data.classId : 'rifleman';
    const room = getOrCreateRoom(roomId);

    if (room.players.size >= MAX_PLAYERS) {
      socket.emit('error', { message: 'Room is full (max 16 players)' });
      return;
    }

    const team = assignTeam(room);
    if (!team) {
      socket.emit('error', { message: 'Teams are full' });
      return;
    }

    const cls = CLASSES[classId];

    playerData = {
      id: socket.id,
      name,
      team,
      classId,
      className: cls.name,
      x: team === 'blue' ? -30 + Math.random() * 10 : 30 + Math.random() * 10,
      y: 0,
      z: (Math.random() - 0.5) * 20,
      rx: 0,
      ry: team === 'blue' ? 0 : Math.PI,
      health: cls.health,
      maxHealth: cls.health,
      kills: 0,
      deaths: 0,
      weapon: cls.primary,
      lastShot: 0,
      speedMult: cls.speed,
      special: cls.special,
      charges: classId === 'engineer' ? 2 : 0,
      isUsingDeployed: false,
      deployedLmgId: null
    };

    room.players.set(socket.id, playerData);
    room.teams[team].push(socket.id);
    currentRoom = roomId;
    socket.join(roomId);

    socket.emit('init', {
      id: socket.id,
      team,
      classId,
      className: cls.name,
      players: Array.from(room.players.values()),
      scores: room.scores,
      deployedLmgs: Array.from(room.deployedLmgs.entries()).map(([id, d]) => ({ id, ...d })),
      classes: CLASSES,
      weapons: WEAPONS
    });

    socket.to(roomId).emit('playerJoined', playerData);
    console.log(name + ' (' + cls.name + ') joined room ' + roomId + ' as ' + team);
  });

  socket.on('update', (data) => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || player.health <= 0) return;

    player.x = data.x;
    player.y = data.y;
    player.z = data.z;
    player.rx = data.rx;
    player.ry = data.ry;
    player.isUsingDeployed = !!data.isUsingDeployed;

    socket.to(currentRoom).emit('playerUpdate', {
      id: socket.id,
      x: player.x,
      y: player.y,
      z: player.z,
      rx: player.rx,
      ry: player.ry,
      health: player.health,
      weapon: player.weapon,
      isUsingDeployed: player.isUsingDeployed
    });
  });

  socket.on('deployLmg', (data) => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || player.special !== 'deploy_lmg' || player.health <= 0) return;

    for (const [id, d] of room.deployedLmgs) {
      if (d.ownerId === socket.id) {
        room.deployedLmgs.delete(id);
        io.to(currentRoom).emit('lmgRemoved', { id });
      }
    }

    const lmgId = 'lmg_' + socket.id + '_' + Date.now();
    const deployed = {
      id: lmgId,
      x: data.x,
      y: data.y,
      z: data.z,
      ry: data.ry || 0,
      team: player.team,
      ownerId: socket.id,
      health: 150
    };
    room.deployedLmgs.set(lmgId, deployed);
    io.to(currentRoom).emit('lmgDeployed', deployed);
  });

  socket.on('mountLmg', (data) => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    const lmg = room.deployedLmgs.get(data.lmgId);
    if (!player || !lmg || lmg.team !== player.team || player.health <= 0) return;

    player.isUsingDeployed = true;
    player.deployedLmgId = data.lmgId;
    player.weapon = 'deployed_lmg';
    socket.to(currentRoom).emit('playerUpdate', {
      id: socket.id,
      isUsingDeployed: true,
      weapon: 'deployed_lmg'
    });
  });

  socket.on('dismountLmg', () => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.isUsingDeployed = false;
    player.deployedLmgId = null;
    player.weapon = CLASSES[player.classId].primary;
    socket.to(currentRoom).emit('playerUpdate', {
      id: socket.id,
      isUsingDeployed: false,
      weapon: player.weapon
    });
  });

  socket.on('plantCharge', (data) => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || player.special !== 'charge' || player.charges <= 0 || player.health <= 0) return;

    player.charges--;
    const chargeId = 'charge_' + socket.id + '_' + Date.now();

    setTimeout(() => {
      io.to(currentRoom).emit('chargeExploded', {
        id: chargeId,
        x: data.x, y: data.y, z: data.z,
        radius: 8, damage: 80
      });

      for (const [id, target] of room.players) {
        if (target.health <= 0) continue;
        const dx = target.x - data.x;
        const dy = target.y - data.y;
        const dz = target.z - data.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < 8) {
          const dmg = Math.floor(80 * (1 - dist / 8));
          target.health = Math.max(0, target.health - dmg);
          if (target.health <= 0) {
            target.deaths++;
            if (target.team !== player.team) {
              player.kills++;
              room.scores[player.team]++;
            }
            io.to(currentRoom).emit('playerKilled', {
              killerId: socket.id,
              victimId: id,
              scores: room.scores
            });
          } else {
            io.to(currentRoom).emit('playerHit', { id, health: target.health });
          }
        }
      }
    }, 5000);

    io.to(currentRoom).emit('chargePlanted', {
      id: chargeId, x: data.x, y: data.y, z: data.z, team: player.team
    });
  });

  socket.on('heal', (data) => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player || player.special !== 'heal' || player.health <= 0) return;

    const target = room.players.get(data.targetId);
    if (!target || target.team !== player.team || target.health <= 0 || target.health >= target.maxHealth) return;

    target.health = Math.min(target.maxHealth, target.health + 25);
    io.to(currentRoom).emit('playerHit', { id: target.id, health: target.health });
  });

  socket.on('shoot', (data) => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const shooter = room.players.get(socket.id);
    if (!shooter || shooter.health <= 0) return;

    const weaponKey = shooter.isUsingDeployed ? 'deployed_lmg' : shooter.weapon;
    const weapon = WEAPONS[weaponKey] || WEAPONS.rifle;

    const now = Date.now();
    if (now - shooter.lastShot < weapon.fireRate) return;
    shooter.lastShot = now;

    const dir = data.dir;
    if (!dir) return;

    let closestHit = null;
    let closestDist = 120;

    for (const [id, target] of room.players) {
      if (id === socket.id || target.team === shooter.team || target.health <= 0) continue;
      const dx = target.x - shooter.x;
      const dy = (target.y + 1.2) - (shooter.y + 1.5);
      const dz = target.z - shooter.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > closestDist) continue;
      const ndx = dx / dist, ndy = dy / dist, ndz = dz / dist;
      const dot = ndx * dir.x + ndy * dir.y + ndz * dir.z;
      const threshold = shooter.isUsingDeployed ? 0.92 : 0.96;
      if (dot > threshold) {
        closestHit = target;
        closestDist = dist;
      }
    }

    if (closestHit) {
      closestHit.health -= weapon.damage;
      if (closestHit.health <= 0) {
        closestHit.health = 0;
        closestHit.deaths++;
        shooter.kills++;
        room.scores[shooter.team]++;
        io.to(currentRoom).emit('playerKilled', {
          killerId: socket.id,
          victimId: closestHit.id,
          scores: room.scores,
          weapon: weaponKey
        });
        setTimeout(() => {
          if (room.players.has(closestHit.id)) {
            const cls = CLASSES[closestHit.classId];
            closestHit.health = cls.health;
            closestHit.x = closestHit.team === 'blue' ? -30 + Math.random() * 10 : 30 + Math.random() * 10;
            closestHit.z = (Math.random() - 0.5) * 20;
            closestHit.isUsingDeployed = false;
            closestHit.weapon = cls.primary;
            io.to(currentRoom).emit('playerRespawn', {
              id: closestHit.id,
              x: closestHit.x, y: closestHit.y, z: closestHit.z,
              health: closestHit.health,
              weapon: closestHit.weapon
            });
          }
        }, 3000);
      } else {
        io.to(currentRoom).emit('playerHit', { id: closestHit.id, health: closestHit.health });
      }
    }

    socket.to(currentRoom).emit('shot', {
      id: socket.id,
      origin: { x: shooter.x, y: shooter.y + 1.5, z: shooter.z },
      dir,
      weapon: weaponKey
    });
  });

  socket.on('disconnect', () => {
    if (!currentRoom || !playerData) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    for (const [id, d] of room.deployedLmgs) {
      if (d.ownerId === socket.id) {
        room.deployedLmgs.delete(id);
        io.to(currentRoom).emit('lmgRemoved', { id });
      }
    }

    room.players.delete(socket.id);
    const teamArr = room.teams[playerData.team];
    const idx = teamArr.indexOf(socket.id);
    if (idx > -1) teamArr.splice(idx, 1);

    socket.to(currentRoom).emit('playerLeft', { id: socket.id });
    if (room.players.size === 0) rooms.delete(currentRoom);
    console.log('Player disconnected: ' + socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Iron Front server running on port ' + PORT);
  console.log('Max players: ' + MAX_PLAYERS + ' | Classes: Rifleman, Support, Marksman, Engineer, Medic');
});

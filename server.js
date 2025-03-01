const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

//const rooms = new Map(); // Estructura: roomId -> {broadcasters: Set, viewers: Set}
const rooms = {}; // Estructura: roomId -> {broadcasters: {}, viewers: {}}
let users = {};

io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('join', (roomId) => {
    socket.join(roomId);
        
    if(!rooms[roomId]) {
      // Primera persona en la sala - será broadcaster
      users[socket.id] = {id: socket.id, name: '', type: 'admin'};
      rooms[roomId] = {
        broadcasters: new Set([socket.id]),
        broadcastersDetail: new Set([socket.id]),
        viewers: new Set()
      };
      socket.emit('broadcaster-status', {
        idUser: socket.id,
        isBroadcaster: true,
        isFirstBroadcaster: true,
        users: users
      });
      console.log('primero', roomId, rooms, socket.id, users);
    }else{
      //const room = rooms.get(roomId);
      const room = rooms[roomId];
      if (room.broadcasters.size < 2) {
        // Segunda persona - también será broadcaster
        users[socket.id] = {id: socket.id, name: '', type: 'guest'};
        room.broadcasters.add(socket.id);
        socket.emit('broadcaster-status', {
          idUser: socket.id,
          isBroadcaster: true,
          isFirstBroadcaster: false,
          users: users
        });
                
        // Notificar a los broadcasters para que se conecten entre sí
        Array.from(room.broadcasters).forEach(broadcasterId => {
          if (broadcasterId !== socket.id) {
            io.to(broadcasterId).emit('initiate-peer-connection', socket.id, users);
          }
        });
        console.log('segundo', roomId, rooms, socket.id, users);
      } else {
        // Es un espectador
        users[socket.id] = {id: socket.id, name: '', type: 'viewer'};
        room.viewers.add(socket.id);
        socket.emit('broadcaster-status', {
          idUser: socket.id,
          isBroadcaster: false,
          broadcasters: Array.from(room.broadcasters),
          users: users
        });
                
        // Notificar a los broadcasters sobre el nuevo espectador
        room.broadcasters.forEach(broadcasterId => {
          io.to(broadcasterId).emit('viewer-joined', socket.id);
        });
        console.log('espectador', roomId, rooms, socket.id, users);
      }
    }

    // Emitir estado actualizado de la sala
    //const room = rooms.get(roomId);
    const room = rooms[roomId] ? rooms[roomId] : {broadcasters: [], viewers: []};
    io.to(roomId).emit('room-info', {
      roomId,
      //broadcasters: Array.from(room.broadcasters),
      //viewerCount: room.viewers.size
      broadcasters: room.broadcasters,
      viewerCount: room.viewers.size
    });
  });

    socket.on('offer', ({ targetId, offer }) => {
        console.log(`Oferta de ${socket.id} para ${targetId}`);
        socket.to(targetId).emit('offer', {
            offer,
            offerId: socket.id
        });
    });

    socket.on('answer', ({ targetId, answer }) => {
        console.log(`Respuesta de ${socket.id} para ${targetId}`);
        socket.to(targetId).emit('answer', {
            answer,
            answerId: socket.id
        });
    });

    socket.on('ice-candidate', ({ targetId, candidate }) => {
        socket.to(targetId).emit('ice-candidate', {
            candidate,
            candidateId: socket.id
        });
    });

    socket.on('disconnect', () => {
        //rooms.forEach((room, roomId) => {
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            if (room.broadcasters.has(socket.id)) {
                room.broadcasters.delete(socket.id);
                // Notificar a todos en la sala que un broadcaster se desconectó
                io.to(roomId).emit('broadcaster-disconnected', socket.id);
            }
            if (room.viewers.has(socket.id)) {
                room.viewers.delete(socket.id);
            }

            if (room.broadcasters.size === 0 && room.viewers.size === 0) {
                //rooms.delete(roomId);
                delete rooms[roomId];
            } else {
                // Actualizar información de la sala
                io.to(roomId).emit('room-info', {
                    roomId,
                    broadcasters: Array.from(room.broadcasters),
                    viewerCount: room.viewers.size
                });
            }
        });
    });

    socket.on('chat-message', ({ roomId, message }) => {
        const room = rooms.get(roomId);
        if (room) {
            // Determinar si el usuario es broadcaster o espectador
            const isBroadcaster = room.broadcasters.has(socket.id);
            const userType = isBroadcaster ? 'Broadcaster' : 'Espectador';
            
            // Crear objeto del mensaje
            const messageData = {
                userId: socket.id.slice(0, 6),
                userType: userType,
                message: message,
                timestamp: new Date().toISOString()
            };
            
            // Enviar el mensaje a todos en la sala
            io.to(roomId).emit('chat-message', messageData);
        }
    });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
require('dotenv').config();

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
  socket.on('join', (roomId, userType) => {
    socket.join(roomId);

    users[socket.id] = {id: socket.id, name: '', type: 'admin', userType: userType};
    const isBroadcaster = userType=='kukurygirl' || userType=='guest';
    let isFirstBroadcaster = false;

    if(!rooms[roomId]) {
      rooms[roomId] = {
        broadcasters: new Set(),
        viewers: new Set()
      };

      isFirstBroadcaster = isBroadcaster ? true : false;
      //console.log('primero', roomId, rooms, socket.id, users);
    }

    const room = rooms[roomId];
    isBroadcaster && room.broadcasters.add(socket.id);
    !isBroadcaster && room.viewers.add(socket.id);

    if(userType =='kukurygirl' || userType =='guest'){
      console.log('1 join: userType', userType);
      socket.emit('broadcaster-status', {
        idUser: socket.id,
        isBroadcaster: isBroadcaster,
        isFirstBroadcaster: isFirstBroadcaster,
        broadcasters: Array.from(room.broadcasters),
        users: users
      });

      // Notificar a los broadcasters para que se conecten entre sí
      Array.from(room.broadcasters).forEach(broadcasterId => {
        console.log('2 join: broadcasterId para initiate-peer-connection', broadcasterId);
        if (broadcasterId !== socket.id) {
          io.to(broadcasterId).emit('initiate-peer-connection', socket.id, users);
        }
      });

      // Notificar a los broadcasters sobre el nuevo espectador
      room.broadcasters.forEach(broadcasterId => {
        console.log('4 join: broadcasterId para viewer-joined', broadcasterId);
        io.to(broadcasterId).emit('viewer-joined', socket.id);
      });
    }

    if(userType =='viewer'){
      console.log('3 join: userType', userType);
      socket.emit('broadcaster-status', {
        idUser: socket.id,
        isBroadcaster: false,
        broadcasters: Array.from(room.broadcasters),
        users: users
      });

      // Notificar a los broadcasters sobre el nuevo espectador
      room.broadcasters.forEach(broadcasterId => {
        console.log('4 join: broadcasterId para viewer-joined', broadcasterId);
        io.to(broadcasterId).emit('viewer-joined', socket.id);
      });
    }

    /*users[socket.id] = {id: socket.id, name: '', type: 'admin', userType: userType};
    const isBroadcaster = userDetail.userType=='kukurygirl' || userDetail.userType=='guest';
    let isFirstBroadcaster = false;
    if(!rooms[roomId]) {
      rooms[roomId] = {
        broadcasters: [socket.id],
        viewers: new Set()
      };

      socket.emit('broadcaster-status', {
        isBroadcaster: true,
        isFirstBroadcaster: true
      });
      isFirstBroadcaster = isBroadcaster ? true : false;
      //console.log('primero', roomId, rooms, socket.id, users);
    }else{
        //const room = rooms.get(roomId);
        const room = rooms[roomId];
        if (room.broadcasters.size < 2) {
          // Segunda persona - también será broadcaster
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
        } else {
          // Es un espectador
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
        }
      }*/

      /*
      const room = rooms[roomId];
      isBroadcaster && room.broadcasters.add(socket.id);
      !isBroadcaster && room.viewers.add(socket.id);

      if(isBroadcaster){
        socket.emit('broadcaster-status', {
          idUser: socket.id,
          isBroadcaster: true,
          isFirstBroadcaster: isFirstBroadcaster,
          users: users
        });

        // Notificar a los broadcasters para que se conecten entre sí
        Array.from(room.broadcasters).forEach(broadcasterId => {
          if (broadcasterId !== socket.id) {
            io.to(broadcasterId).emit('initiate-peer-connection', socket.id, users);
          }
        });
      }

      if(!isBroadcaster){
        // Es un espectador
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
      }*/

    console.log('Usuario conectado:', socket.id, users);

    // Emitir estado actualizado de la sala
    //const room = rooms.get(roomId);
    io.to(roomId).emit('room-info', {
      roomId,
      broadcasters: Array.from(room.broadcasters),
      viewerCount: room.viewers.size,
      //broadcasters: room.broadcasters,
      //viewerCount: room.viewers.size,
      users: users
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
      if(users[socket.id]){
        delete users[socket.id];
      }
      console.log('Usuario desconectado:', socket.id, users);
      //rooms.forEach((room, roomId) => {
      Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        if(room.broadcasters.has(socket.id)) {
          room.broadcasters.delete(socket.id);
          // Notificar a todos en la sala que un broadcaster se desconectó
          io.to(roomId).emit('broadcaster-disconnected', socket.id);
        }
        if(room.viewers.has(socket.id)) {
          room.viewers.delete(socket.id);
        }

        if(room.broadcasters.size === 0 && room.viewers.size === 0) {
          //rooms.delete(roomId);
          delete rooms[roomId];
        }else {
          // Actualizar información de la sala
          io.to(roomId).emit('room-info', {
            roomId,
            broadcasters: Array.from(room.broadcasters),
            viewerCount: room.viewers.size,
            users: users
          });
        }
      });
    });

    socket.on('chat-message', ({ roomId, message }) => {
        //const room = rooms.get(roomId);
        const room = rooms[roomId];
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
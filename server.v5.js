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

const rooms = {};  // Structure: roomId -> {broadcasters: [], viewers: []}
let roomNow;
let users = {};
let topic;

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    data = (typeof data === 'object') ? data : {};
    let roomId = data.roomId ? data.roomId : null;
    const userType = data.userType ? data.userType : null;
    const nick = data.nick ? data.nick : socket.id;
    const ip = data.ip ? data.ip : null;
    const from = data.from ? data.from : null;
    const fromFull = data.fromFull ? data.fromFull : null;
    console.log('1 sala', roomId, data);
    
    if(userType == 'kukurygirl' && !roomId){
      return socket.emit('socketErrores', {type: 'canceledJoin', userType: userType, message: 'Ingresa una sala.'});
    }

    if(userType == 'guest' || userType == 'viewer'){
      console.log('2 viewer/guest sala', roomNow, roomId);
      if(!roomNow){
        //return io.to(socket.id).emit('socketErrores', {message: 'No hay salas disponibles. Intenta más tarde.'});
        return socket.emit('socketErrores', {type: 'canceledJoin', userType: userType, message: 'No hay salas disponibles. Intenta más tarde.'});
        //return socket.to(socket.id).emit('socketErrores', {message: 'No hay salas disponibles. Intenta más tarde.'});
      }else{
        roomId = roomNow;
      }
    }

    socket.join(roomId);
    roomNow = roomId;

    users[socket.id] = {id: socket.id, nick: nick, ip: ip, userType: userType, from: from, fromFull: fromFull};
    const isBroadcaster = userType=='kukurygirl' || userType=='guest';
    let isFirstBroadcaster = false;

    if(!rooms[roomId]){
      topic = data.topic ? data.topic : '';

      rooms[roomId] = {
        broadcasters: [],
        viewers: [], 
        topic: topic
      };

      isFirstBroadcaster = isBroadcaster;
    }

    const room = rooms[roomId];
    
    // Add user to appropriate list
    if(isBroadcaster){
      // Check if broadcaster already exists (avoid duplicates)
      if(!room.broadcasters.includes(socket.id)) {
        room.broadcasters.push(socket.id);
      }
    } else {
      // Check if viewer already exists (avoid duplicates)
      if(!room.viewers.includes(socket.id)) {
        room.viewers.push(socket.id);
      }
    }

    if(userType =='kukurygirl' || userType =='guest'){
      //console.log('1 join: userType', userType);
      if(userType =='guest'){
        socket.emit('set-room', {
          roomId: roomId,
          userType: userType
        });
      }

      socket.emit('broadcaster-status', {
        idUser: socket.id,
        isBroadcaster: isBroadcaster,
        isFirstBroadcaster: isFirstBroadcaster,
        broadcasters: room.broadcasters,
        users: users
      });

      // Notify other broadcasters to connect with this broadcaster
      room.broadcasters.forEach(broadcasterId => {
        //console.log('2 join: broadcasterId para initiate-peer-connection', broadcasterId);
        if (broadcasterId !== socket.id) {
          io.to(broadcasterId).emit('initiate-peer-connection', socket.id, users);
        }
      });

      // Notify all viewers about this broadcaster
      room.viewers.forEach(viewerId => {
        //console.log('Notifying viewer', viewerId, 'about broadcaster', socket.id);
        //io.to(viewerId).emit('broadcaster-joined', socket.id, users);
        io.to(socket.id).emit('viewer-joined', viewerId);
      });
    }

    if(userType =='viewer'){
      //console.log('3 join: userType', userType);
      socket.emit('set-room', {
        roomId: roomId,
        userType: userType
      });

      socket.emit('broadcaster-status', {
        idUser: socket.id,
        roomId: roomId,
        isBroadcaster: false,
        broadcasters: room.broadcasters,
        users: users
      });

      // Notify broadcasters about the new viewer
      room.broadcasters.forEach(broadcasterId => {
        //console.log('4 join: broadcasterId para viewer-joined', broadcasterId);
        io.to(broadcasterId).emit('viewer-joined', socket.id);
      });
    }

    console.log('Usuario conectado:', socket.id, users);

    // Emit updated room state
    io.to(roomId).emit('room-info', {
      roomId,
      broadcasters: room.broadcasters,
      viewerCount: room.viewers.length,
      users: users,
      topic: topic
    });
  });

  socket.on('offer', ({ targetId, offer }) => {
    //console.log(`Oferta de ${socket.id} para ${targetId}`);
    socket.to(targetId).emit('offer', {
      offer,
      offerId: socket.id
    });
  });

  socket.on('answer', ({ targetId, answer }) => {
    //console.log(`Respuesta de ${socket.id} para ${targetId}`);
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
      if(users[socket.id].userType == 'kukurygirl'){
        roomNow = null;
      }
      delete users[socket.id];
    }
    console.log('Usuario desconectado:', socket.id, users);
    
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      
      // Remove from broadcasters or viewers arrays
      const broadcasterIndex = room.broadcasters.indexOf(socket.id);
      if(broadcasterIndex !== -1) {
        room.broadcasters.splice(broadcasterIndex, 1);
        // Notify everyone in the room that a broadcaster disconnected
        io.to(roomId).emit('broadcaster-disconnected', socket.id);
      }
      
      const viewerIndex = room.viewers.indexOf(socket.id);
      if(viewerIndex !== -1) {
        room.viewers.splice(viewerIndex, 1);
      }

      if(room.broadcasters.length === 0 && room.viewers.length === 0) {
        delete rooms[roomId];
      } else {
        // Update room information
        io.to(roomId).emit('room-info', {
          roomId,
          broadcasters: room.broadcasters,
          viewerCount: room.viewers.length,
          users: users
        });
      }
    });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (room) {
      // Determine if user is broadcaster or viewer
      const isBroadcaster = room.broadcasters.includes(socket.id);
      const userType = isBroadcaster ? 'Broadcaster' : 'Espectador';
      const nick = users[socket.id].nick ? users[socket.id].nick : socket.id;
      
      // Create message object
      const messageData = {
        userId: socket.id.slice(0, 6),
        nick, nick,
        userType: userType,
        message: message,
        timestamp: new Date().toISOString()
      };
      
      // Send message to everyone in the room
      io.to(roomId).emit('chat-message', messageData);
    }
  });

  // Manejar control de medios (video/audio)
  socket.on('media-control', (data) => {
    /*
    const roomId = data.roomId;
    const room = rooms[roomId];
    
    if(room){
      // Añadir información del usuario que realizó el cambio
      data.userId = socket.id;
      data.nick = users[socket.id]?.nick || socket.id;
      
      // Reenviar a todos en la sala
      io.to(roomId).emit('media-control', data);
      console.log(`Usuario ${socket.id} (${data.nick}) cambió estado de ${data.mediaType} a ${data.enabled ? 'activado' : 'desactivado'}`);
    }*/
  });

  // Manejar cuando un usuario abandona voluntariamente
  socket.on('leave-room', (data) => {
    const roomId = data.roomId;
    const room = rooms[roomId];
    
    if(room){
      // Notificar a todos los demás usuarios en la sala
      socket.to(roomId).emit('user-left', socket.id);
      
      // Remover al usuario de la sala
      const broadcasterIndex = room.broadcasters.indexOf(socket.id);
      if(broadcasterIndex !== -1) {
        room.broadcasters.splice(broadcasterIndex, 1);
      }
      
      const viewerIndex = room.viewers.indexOf(socket.id);
      if(viewerIndex !== -1) {
        room.viewers.splice(viewerIndex, 1);
      }
      
      // Si es kukurygirl y está saliendo, reset roomNow
      if(users[socket.id] && users[socket.id].userType === 'kukurygirl') {
        roomNow = null;
      }
      
      // Abandonar la sala en Socket.IO
      socket.leave(roomId);
      
      // Si la sala queda vacía, eliminarla
      if(room.broadcasters.length === 0 && room.viewers.length === 0) {
        delete rooms[roomId];
      } else {
        // Actualizar información de la sala para los restantes
        io.to(roomId).emit('room-info', {
          roomId,
          broadcasters: room.broadcasters,
          viewerCount: room.viewers.length,
          users: users
        });
      }
      
      console.log(`Usuario ${socket.id} abandonó voluntariamente la sala ${roomId}`);
    }
  });

  socket.on('sendHeart', (data) => {
    const roomId = data.roomId ? data.roomId : '';
    io.to(roomId).emit('sendHeart', data);
  });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor V5 corriendo en puerto ${PORT}`);
});
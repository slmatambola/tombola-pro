const express = require('express');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- WEBSOCKETS ---
io.on('connection', async (socket) => {
  console.log('👀 Nouveau visiteur connecté.');

  try {
    const products = await prisma.product.findMany();
    
    const productsWithProgress = await Promise.all(products.map(async (product) => {
      const activeRound = await prisma.round.findFirst({ where: { productId: product.id, status: 'en_cours' } });
      let ticketCount = 0;
      if (activeRound) {
        ticketCount = await prisma.ticket.count({ where: { roundId: activeRound.id } });
      }
      return { ...product, ticketCount };
    }));

    const lastWinners = await prisma.winner.findMany({
      take: 5,
      orderBy: { id: 'desc' },
      include: { user: true, round: { include: { product: true } } }
    });

    socket.emit('init_products', { products: productsWithProgress, winners: lastWinners });
    products.forEach(p => socket.join(`product_${p.id}`));
  } catch (error) {
    console.error("Erreur init:", error);
  }

  socket.on('buy_ticket', async (data) => {
    const { productId, quantity = 1 } = data;
    try {
      const userId = crypto.randomUUID(); 
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, email: `${userId}@demo.com`, nom: 'Joueur Demo' }
      });

      let activeRound = await prisma.round.findFirst({ where: { productId: productId, status: 'en_cours' } });
      if (!activeRound) {
        activeRound = await prisma.round.create({ data: { productId: productId } });
      }

      const product = await prisma.product.findUnique({ where: { id: productId } });
      const LIMIT = product.ticketLimit;

      const lastTicket = await prisma.ticket.findFirst({
        where: { roundId: activeRound.id },
        orderBy: { numero_du_ticket: 'desc' }
      });
      let nextNum = (lastTicket?.numero_du_ticket || 0) + 1;

      for (let i = 0; i < quantity; i++) {
        await prisma.ticket.create({
          data: { numero_du_ticket: nextNum + i, userId: userId, roundId: activeRound.id }
        });
      }

      const totalTickets = await prisma.ticket.count({ where: { roundId: activeRound.id } });

      io.to(`product_${productId}`).emit('ticket_update', { 
        productId: productId, 
        ticketCount: totalTickets,
        ticketLimit: LIMIT 
      });

      if (totalTickets >= LIMIT) {
        console.log(`🔥 TIRAGE : ${product.name} est complet !`);

        const allTickets = await prisma.ticket.findMany({ where: { roundId: activeRound.id } });
        const secureRandomIndex = crypto.randomBytes(4).readUInt32LE(0) % LIMIT;
        const winningTicket = allTickets[secureRandomIndex];

        const winner = await prisma.winner.create({
          data: { userId: winningTicket.userId, roundId: activeRound.id, prize: product.name },
          include: { user: true, round: { include: { product: true } } }
        });

        await prisma.round.update({ where: { id: activeRound.id }, data: { status: 'tire' } });
        const newRound = await prisma.round.create({ data: { productId: productId } });

        io.emit('new_winner', { 
          message: `Félicitations ! Vous gagnez ${product.name} !`,
          winnerData: winner 
        });

        setTimeout(() => {
          io.to(`product_${productId}`).emit('new_round', { productId, ticketCount: 0 });
        }, 5000);
      }
    } catch (error) {
      console.error("Erreur achat:", error);
    }
  });

  socket.on('disconnect', () => {});
});


// --- API ADMIN ---
app.get('/api/products', async (req, res) => {
  const products = await prisma.product.findMany({
    include: { _count: { select: { rounds: true } } }
  });
  res.json(products);
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, description, imageUrl, ticketPrice, ticketLimit } = req.body;
    const newProduct = await prisma.product.create({
      data: { name, description, imageUrl, ticketPrice, ticketLimit }
    });
    await prisma.round.create({ data: { productId: newProduct.id } });
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: "Erreur ajout" });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const rounds = await prisma.round.findMany({ 
      where: { productId: id }, 
      select: { id: true } 
    });
    const roundIds = rounds.map(r => r.id);

    if (roundIds.length > 0) {
      await prisma.ticket.deleteMany({ where: { roundId: { in: roundIds } } });
      await prisma.winner.deleteMany({ where: { roundId: { in: roundIds } } });
    }

    await prisma.product.delete({ where: { id } });
    
    res.status(200).json({ message: "Produit supprimé avec succès" });
  } catch (error) {
    console.error("Erreur suppression:", error);
    res.status(500).json({ error: "Erreur suppression" });
  }
});


const PORT = 4000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Backend lancé sur http://localhost:${PORT}`);
});
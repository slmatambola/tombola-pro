const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Création des produits dans la base de données...");

  // 1. On crée les produits
  const iphone = await prisma.product.create({
    data: {
      name: "iPhone 17 Pro Max",
      description: "Le dernier bijou d'Apple, 256Go Titane.",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/IPhone_15_Pro_Max.png/220px-IPhone_15_Pro_Max.png", // Image d'exemple
      ticketPrice: 100, // 100 centimes = 1€
      ticketLimit: 1500, // Nécessite 1500 tickets
    }
  });

  const ps5 = await prisma.product.create({
    data: {
      name: "PlayStation 5 Slim",
      description: "La console de Sony avec 2 manettes.",
      imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/PS5-console.png/220px-PS5-console.png",
      ticketPrice: 100, // 1€
      ticketLimit: 800, // Nécessite 800 tickets
    }
  });

  const pc = await prisma.product.create({
    data: {
      name: "PC Gamer RTX 4090",
      description: "Machine de guerre pour jouer en 4K.",
      imageUrl: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?w=300",
      ticketPrice: 200, // 2€
      ticketLimit: 500, // Nécessite 500 tickets
    }
  });

  // 2. Pour chaque produit, on crée son PREMIER round
  await prisma.round.create({ data: { productId: iphone.id } });
  await prisma.round.create({ data: { productId: ps5.id } });
  await prisma.round.create({ data: { productId: pc.id } });

  console.log("✅ Les 3 produits et leurs rounds ont été créés avec succès !");
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
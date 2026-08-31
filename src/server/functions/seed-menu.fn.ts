import { createServerFn } from "@tanstack/react-start";
import { gerarSlugDeProduto } from "@/lib/slug-de-produto";
import { z } from "zod";
import { requireAdminSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";

export const seedMenuFn = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => {
    const store = await requireAdminSession();
    if (!store) throw new Error("Not authenticated");

    console.log("🍽️ Criando cardápio...");

    // Criar categorias
    const pratos = await prisma.category.upsert({
      where: { storeId_name: { storeId: store.storeId, name: "Pratos" } },
      update: {},
      create: {
        storeId: store.storeId,
        name: "Pratos",
        slug: "pratos",
        icon: "🍔",
        sortOrder: 1,
      },
    });

    const bebidas = await prisma.category.upsert({
      where: { storeId_name: { storeId: store.storeId, name: "Bebidas" } },
      update: {},
      create: {
        storeId: store.storeId,
        name: "Bebidas",
        slug: "bebidas",
        icon: "🥤",
        sortOrder: 2,
      },
    });

    // Pratos
    const pratosData = [
      { name: "Hambúrguer Clássico", price: 35 },
      { name: "Hambúrguer Duplo", price: 45 },
      { name: "Hambúrguer com Bacon", price: 42 },
      { name: "Pizza Margherita", price: 38 },
      { name: "Pizza Pepperoni", price: 42 },
      { name: "Frango Grelhado", price: 40 },
      { name: "Costela BBQ", price: 55 },
      { name: "Salmão Grelhado", price: 58 },
      { name: "Moqueca de Peixe", price: 48 },
      { name: "Feijoada", price: 42 },
      { name: "Churrascaria", price: 65 },
      { name: "Lasanha à Bolonhesa", price: 38 },
      { name: "Macarrão Carbonara", price: 36 },
      { name: "Risoto de Cogumelos", price: 44 },
      { name: "Bruschettas Variadas", price: 28 },
    ];

    for (const prato of pratosData) {
      await prisma.product.upsert({
        where: {
          storeId_slug: {
            storeId: store.storeId,
            slug: gerarSlugDeProduto(prato.name),
          },
        },
        update: {},
        create: {
          storeId: store.storeId,
          categoryId: pratos.id,
          name: prato.name,
          slug: gerarSlugDeProduto(prato.name),
          description: `Delicioso ${prato.name.toLowerCase()}`,
          basePrice: prato.price,
          isActive: true,
          sortOrder: 1,
        },
      });
    }

    // Bebidas
    const bebidasData = [
      { name: "Refrigerante Coca-Cola", price: 8 },
      { name: "Refrigerante Guaraná", price: 8 },
      { name: "Refrigerante Fanta Laranja", price: 7 },
      { name: "Suco Natural Laranja", price: 12 },
      { name: "Suco Natural Morango", price: 12 },
      { name: "Água Mineral", price: 3 },
      { name: "Chá Gelado Limão", price: 6 },
      { name: "Café Expresso", price: 5 },
      { name: "Capuccino", price: 8 },
      { name: "Batida de Frutas", price: 14 },
    ];

    for (const bebida of bebidasData) {
      await prisma.product.upsert({
        where: {
          storeId_slug: {
            storeId: store.storeId,
            slug: gerarSlugDeProduto(bebida.name),
          },
        },
        update: {},
        create: {
          storeId: store.storeId,
          categoryId: bebidas.id,
          name: bebida.name,
          slug: gerarSlugDeProduto(bebida.name),
          description: `Refrescante ${bebida.name.toLowerCase()}`,
          basePrice: bebida.price,
          isActive: true,
          sortOrder: 1,
        },
      });
    }

    return {
      ok: true,
      message: `✅ Cardápio criado! ${pratosData.length} pratos + ${bebidasData.length} bebidas`,
    };
  });

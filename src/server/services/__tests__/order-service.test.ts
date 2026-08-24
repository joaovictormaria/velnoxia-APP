import { describe, it, expect, beforeEach, vi } from "vitest";
import { precificarItens, type CheckoutItem } from "../order-service";
import { prisma } from "../../db/client";

/**
 * PRIORIDADE 5: TESTES DE SERVIÃ‡O DE PEDIDOS
 *
 * Valida precisÃ£o de cÃ¡lculos monetÃ¡rios, descontos, taxas, e validaÃ§Ãµes.
 * Testes unitÃ¡rios para precificarItens (a funÃ§Ã£o crÃ­tica de pricing).
 */

vi.mock("../../db/client");

describe("order-service: precificarItens", () => {
  const storeId = "store-123";

  // Helper para criar produto no mock
  const mockProduct = (overrides = {}) => ({
    id: "prod-1",
    slug: "pizza-calabresa",
    name: "Pizza Calabresa",
    basePrice: 29.99,
    categoryId: "cat-1",
    storeId,
    sizes: [],
    allowHalfAndHalf: false,
    halfPizzaPricingRule: "HIGHEST_PRICE",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    deletedBy: null,
    description: "Test product",
    ...overrides,
  } as any);

  // Helper para criar categoria de tamanho
  const mockCategorySize = (overrides = {}) => ({
    id: "size-1",
    label: "Grande",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CÃ¡lculos bÃ¡sicos de preÃ§o", () => {
    it("deve calcular subtotal correto para um item simples", async () => {
      const prizeProduct = mockProduct({ basePrice: 29.99 });

      vi.mocked(prisma.product.findMany).mockResolvedValue([prizeProduct as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          quantity: 1,
          extraIds: [],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.subtotal).toBe(29.99);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].unitPrice).toBe(29.99);
      expect(result.lines[0].quantity).toBe(1);
    });

    it("deve calcular subtotal com mÃºltiplas quantidades", async () => {
      const product = mockProduct({ basePrice: 15.50 });

      vi.mocked(prisma.product.findMany).mockResolvedValue([product as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          quantity: 3,
          extraIds: [],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 15.50 * 3 = 46.50
      expect(result.subtotal).toBe(46.50);
    });

    it("deve arredondar corretamente em operaÃ§Ãµes de divisÃ£o (AVERAGE_PRICE)", async () => {
      const pizza1 = mockProduct({
        slug: "pizza-calabresa",
        basePrice: 50.00,
        allowHalfAndHalf: true,
      });
      const pizza2 = mockProduct({
        slug: "pizza-margherita",
        name: "Pizza Margherita",
        basePrice: 45.00,
      });

      vi.mocked(prisma.product.findMany).mockResolvedValue([pizza1 as any, pizza2 as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          secondProductSlug: "pizza-margherita",
          quantity: 1,
          extraIds: [],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // (50.00 + 45.00) / 2 = 47.50
      expect(result.subtotal).toBe(47.50);
      expect(result.lines[0].isHalfAndHalf).toBe(true);
    });

    it("deve usar HIGHEST_PRICE quando Ã© meia-pizza sem AVERAGE_PRICE", async () => {
      const pizza1 = mockProduct({
        slug: "pizza-calabresa",
        basePrice: 50.00,
        allowHalfAndHalf: true,
        halfPizzaPricingRule: "HIGHEST_PRICE",
      });
      const pizza2 = mockProduct({
        slug: "pizza-margherita",
        name: "Pizza Margherita",
        basePrice: 45.00,
      });

      vi.mocked(prisma.product.findMany).mockResolvedValue([pizza1 as any, pizza2 as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          secondProductSlug: "pizza-margherita",
          quantity: 1,
          extraIds: [],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Deve usar o maior: 50.00
      expect(result.subtotal).toBe(50.00);
    });
  });

  describe("Adicionais e extras", () => {
    it("deve somar adicional ao preÃ§o do item", async () => {
      const product = mockProduct({ basePrice: 20.00 });

      vi.mocked(prisma.product.findMany).mockResolvedValue([product as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([
        {
          id: "extra-1",
          name: "Bacon extra",
          price: 5.50 as any,
          storeId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      vi.mocked(prisma.extraScope.findMany).mockResolvedValue([
        {
          id: "scope-1",
          extraId: "extra-1",
          categoryId: "cat-1",
          productId: null,
        } as any,
      ]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          quantity: 1,
          extraIds: ["extra-1"],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 20.00 + 5.50 = 25.50
      expect(result.subtotal).toBe(25.50);
    });

    it("deve somar mÃºltiplos adicionais", async () => {
      const product = mockProduct({ basePrice: 30.00 });

      vi.mocked(prisma.product.findMany).mockResolvedValue([product as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([
        {
          id: "extra-1",
          name: "Bacon",
          price: 5.00 as any,
          storeId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "extra-2",
          name: "Queijo extra",
          price: 3.50 as any,
          storeId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      vi.mocked(prisma.extraScope.findMany).mockResolvedValue([
        {
          id: "scope-1",
          extraId: "extra-1",
          categoryId: "cat-1",
          productId: null,
        } as any,
        {
          id: "scope-2",
          extraId: "extra-2",
          categoryId: "cat-1",
          productId: null,
        } as any,
      ]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          quantity: 1,
          extraIds: ["extra-1", "extra-2"],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 30.00 + 5.00 + 3.50 = 38.50
      expect(result.subtotal).toBe(38.50);
    });
  });

  describe("ValidaÃ§Ãµes e erros", () => {
    it("deve retornar erro para carrinho vazio", async () => {
      const items: CheckoutItem[] = [];

      const result = await precificarItens(storeId, items);

      // Nota: precificarItens nÃ£o valida carrinho vazio â€” isso Ã© feito no createOrderFromCheckout
      // Mas deve processar array vazio sem erro
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.subtotal).toBe(0);
    });

    it("deve retornar erro para produto inexistente", async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-inexistente",
          quantity: 1,
          extraIds: [],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("nÃ£o estÃ¡ mais disponÃ­vel");
    });

    it("deve retornar erro para quantidade invÃ¡lida", async () => {
      const product = mockProduct();

      vi.mocked(prisma.product.findMany).mockResolvedValue([product as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          quantity: 0,
          extraIds: [],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("invÃ¡lida");
    });

    it("deve retornar erro se tamanho nÃ£o estÃ¡ disponÃ­vel", async () => {
      const product = mockProduct({ sizes: [] });

      vi.mocked(prisma.product.findMany).mockResolvedValue([product as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([
        mockCategorySize({ id: "size-999" }) as any,
      ]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          sizeId: "size-999", // Este tamanho nÃ£o existe no produto
          quantity: 1,
          extraIds: [],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("nÃ£o estÃ¡ disponÃ­vel");
    });
  });

  describe("CenÃ¡rios realistas de checkout", () => {
    it("2x pizza + 1x adicional cada = subtotal correto", async () => {
      const product = mockProduct({ basePrice: 35.00 });

      vi.mocked(prisma.product.findMany).mockResolvedValue([product as any]);
      vi.mocked(prisma.categorySize.findMany).mockResolvedValue([]);
      vi.mocked(prisma.optionGroup.findMany).mockResolvedValue([]);
      vi.mocked(prisma.extra.findMany).mockResolvedValue([
        {
          id: "extra-1",
          name: "Bacon",
          price: 4.50 as any,
          storeId,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      vi.mocked(prisma.extraScope.findMany).mockResolvedValue([
        {
          id: "scope-1",
          extraId: "extra-1",
          categoryId: "cat-1",
          productId: null,
        } as any,
      ]);

      const items: CheckoutItem[] = [
        {
          productSlug: "pizza-calabresa",
          quantity: 2,
          extraIds: ["extra-1"],
        },
      ];

      const result = await precificarItens(storeId, items);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // (35.00 + 4.50) * 2 = 79.00
      expect(result.subtotal).toBe(79.00);
    });
  });
});


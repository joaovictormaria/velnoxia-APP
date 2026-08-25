import { createFileRoute } from "@tanstack/react-router";
import { seedMenuFn } from "@/server/functions/seed-menu.fn";

export const Route = createFileRoute("/admin/seed-menu")({
  component: SeedMenuPage,
});

function SeedMenuPage() {
  const handleSeed = async () => {
    try {
      const result = await seedMenuFn({ data: {} });
      if (result.ok) {
        alert(result.message);
        window.location.href = "/admin/cardapio";
      }
    } catch (error) {
      alert(`Erro: ${error instanceof Error ? error.message : "Desconhecido"}`);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>🍽️ Criar Cardápio de Teste</h1>
      <p>
        Clique no botão abaixo para criar automaticamente 15 pratos + 10 bebidas no seu cardápio.
      </p>

      <button
        onClick={handleSeed}
        style={{
          padding: "12px 24px",
          fontSize: "16px",
          backgroundColor: "#dc2626",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          marginTop: "20px",
        }}
      >
        ✨ Criar Cardápio Agora
      </button>

      <p style={{ marginTop: "20px", fontSize: "14px", color: "#666" }}>
        Isso criará:
        <ul>
          <li>✅ 15 Pratos (Hambúrguer, Pizza, Grelhados, etc)</li>
          <li>✅ 10 Bebidas (Refrigerantes, Sucos, Café, etc)</li>
          <li>✅ 2 Categorias (Pratos e Bebidas)</li>
        </ul>
      </p>
    </div>
  );
}

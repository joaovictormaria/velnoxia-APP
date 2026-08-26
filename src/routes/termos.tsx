import { createFileRoute } from "@tanstack/react-router";

const title = "Termos de Uso — Velnox.app";
const description = "Leia os termos e condições de uso da Velnox.app.";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Termos,
});

function Termos() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8 sm:py-24">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-2 text-charcoal">
          Termos de Uso
        </h1>
        <p className="text-sm text-charcoal/55 mb-12">
          Última atualização: 26 de agosto de 2026
        </p>

        <div className="space-y-10 text-charcoal/70">
          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              1. Aceitação dos Termos
            </h2>
            <p className="text-sm leading-relaxed">
              Ao acessar e usar a Velnox.app, você concorda em estar vinculado por estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não use nosso serviço.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              2. Descrição do Serviço
            </h2>
            <p className="text-sm leading-relaxed">
              A Velnox.app é uma plataforma de cardápio digital que conecta clientes a restaurantes parceiros para realizar pedidos online e agendar entregas. Somos um intermediário entre você e os restaurantes.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              3. Responsabilidades do Usuário
            </h2>
            <p className="text-sm leading-relaxed mb-3">
              Você concorda em:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 ml-4">
              <li>• Fornecer informações precisas e completas ao se registrar</li>
              <li>• Manter a confidencialidade de sua senha</li>
              <li>• Usar o serviço apenas para fins legais</li>
              <li>• Não interferir ou prejudicar o funcionamento da plataforma</li>
              <li>• Não utilizar a plataforma para vender, alugar ou oferecer qualquer bem ilegal</li>
              <li>• Ser responsável por qualquer atividade em sua conta</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              4. Pedidos e Pagamentos
            </h2>
            <p className="text-sm leading-relaxed mb-3">
              Ao fazer um pedido:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 ml-4">
              <li>• Você concorda em pagar o valor total do pedido</li>
              <li>• Os preços estão sujeitos a alterações sem aviso prévio</li>
              <li>• O restaurante pode recusar seu pedido por qualquer motivo</li>
              <li>• Você é responsável pela precisão das informações de entrega</li>
              <li>• Taxas de entrega podem aplicar-se conforme indicado no aplicativo</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              5. Entregas
            </h2>
            <p className="text-sm leading-relaxed mb-3">
              Informações sobre entregas:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 ml-4">
              <li>• Os tempos de entrega estimados são apenas aproximações</li>
              <li>• Não nos responsabilizamos por atrasos causados por fatores externos</li>
              <li>• O cliente é responsável pelo recebimento do pedido no endereço fornecido</li>
              <li>• A entrega é feita por terceiros (entregadores parceiros)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              6. Limitação de Responsabilidade
            </h2>
            <p className="text-sm leading-relaxed">
              A Velnox.app atua como intermediária. Não nos responsabilizamos por qualidade dos alimentos, atitudes de entregadores ou restaurantes. Qualquer reclamação sobre qualidade deve ser dirigida ao restaurante. Limitamos nossa responsabilidade ao valor do pedido.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              7. Conteúdo do Usuário
            </h2>
            <p className="text-sm leading-relaxed">
              Qualquer avaliação ou comentário que você publicar na plataforma pode ser usado livremente pela Velnox.app. Você garante que tem os direitos necessários sobre o conteúdo que você envia.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              8. Propriedade Intelectual
            </h2>
            <p className="text-sm leading-relaxed">
              O conteúdo, design, funcionalidade e código-fonte da Velnox.app são propriedade exclusiva da Velnox.app e estão protegidos por leis de propriedade intelectual. Você não pode reproduzir, distribuir ou usar qualquer parte sem permissão.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              9. Proibições
            </h2>
            <p className="text-sm leading-relaxed mb-3">
              Você não pode:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 ml-4">
              <li>• Usar a plataforma para spam ou phishing</li>
              <li>• Tentar acessar áreas restritas sem autorização</li>
              <li>• Usar scripts ou bots para automatizar pedidos</li>
              <li>• Publicar conteúdo ofensivo, violento ou ilegal</li>
              <li>• Fazer múltiplos pedidos fraudulentos ou cancelamentos abusivos</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              10. Rescisão
            </h2>
            <p className="text-sm leading-relaxed">
              Podemos suspender ou encerrar sua conta se você violar estes Termos. Você também pode encerrar sua conta a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              11. Modificações dos Termos
            </h2>
            <p className="text-sm leading-relaxed">
              Reservamos o direito de modificar estes Termos a qualquer momento. Sua continuação no uso da plataforma após as alterações significa sua aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              12. Lei Aplicável
            </h2>
            <p className="text-sm leading-relaxed">
              Estes Termos são regidos pelas leis da República Federativa do Brasil.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              13. Contato
            </h2>
            <p className="text-sm leading-relaxed">
              Se você tiver dúvidas sobre estes Termos de Uso, entre em contato conosco através dos canais disponíveis no aplicativo.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-charcoal/12 text-center">
          <p className="text-sm text-charcoal/60 mb-3">
            Velnox.app é uma plataforma de
          </p>
          <a
            href="https://www.velnoxia.com.br"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-tomato hover:underline"
          >
            A Velnox.IA →
          </a>
        </div>
      </div>
    </main>
  );
}

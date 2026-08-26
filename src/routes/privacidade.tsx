import { createFileRoute } from "@tanstack/react-router";

const title = "Política de Privacidade — Velnox.app";
const description = "Saiba como a Velnox.app protege e trata seus dados pessoais.";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8 sm:py-24">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-2 text-charcoal">
          Política de Privacidade
        </h1>
        <p className="text-sm text-charcoal/55 mb-12">
          Última atualização: 26 de agosto de 2026
        </p>

        <div className="space-y-10 text-charcoal/70">
          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              1. Introdução
            </h2>
            <p className="text-sm leading-relaxed">
              A Velnox.app ("nós", "nosso" ou "empresa") opera a plataforma de cardápio digital e entrega de alimentos. Esta página é responsável por informar você sobre nossas políticas referentes à coleta, uso e divulgação de dados pessoais se você decidir usar nosso serviço.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              2. Informações que Coletamos
            </h2>
            <p className="text-sm leading-relaxed mb-3">
              Coletamos informações que você nos fornece diretamente, incluindo:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 ml-4">
              <li>• Nome e informações de contato (email, telefone)</li>
              <li>• Endereço de entrega</li>
              <li>• Histórico de pedidos</li>
              <li>• Informações de pagamento (processadas por provedores terceirizados seguros)</li>
              <li>• Avaliações e comentários que você deixa</li>
              <li>• Localização (quando necessário para entrega)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              3. Como Usamos Suas Informações
            </h2>
            <p className="text-sm leading-relaxed mb-3">
              Usamos as informações coletadas para:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 ml-4">
              <li>• Processar seus pedidos e entregas</li>
              <li>• Entrar em contato sobre seu pedido</li>
              <li>• Melhorar nossos serviços</li>
              <li>• Enviar atualizações e informações relevantes (com seu consentimento)</li>
              <li>• Cumprir obrigações legais</li>
              <li>• Prevenir fraudes e abusos</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              4. Compartilhamento de Dados
            </h2>
            <p className="text-sm leading-relaxed">
              Seus dados podem ser compartilhados com entregadores (apenas informações necessárias para entrega), restaurantes parceiros (informações do pedido), e provedores de serviços de pagamento. Nunca vendemos suas informações para terceiros para fins de marketing.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              5. Segurança dos Dados
            </h2>
            <p className="text-sm leading-relaxed">
              Implementamos medidas de segurança técnicas e organizacionais para proteger suas informações contra acesso não autorizado, alteração, divulgação ou destruição.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              6. Seus Direitos
            </h2>
            <p className="text-sm leading-relaxed mb-3">
              Você tem o direito de:
            </p>
            <ul className="text-sm leading-relaxed space-y-2 ml-4">
              <li>• Acessar seus dados pessoais</li>
              <li>• Solicitar correção de dados incorretos</li>
              <li>• Solicitar exclusão de seus dados</li>
              <li>• Optar por não receber comunicações de marketing</li>
              <li>• Solicitar a portabilidade de dados</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              7. Retenção de Dados
            </h2>
            <p className="text-sm leading-relaxed">
              Mantemos seus dados pessoais pelo tempo necessário para fornecer nossos serviços e cumprir nossas obrigações legais. Você pode solicitar a exclusão de seus dados a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              8. Cookies
            </h2>
            <p className="text-sm leading-relaxed">
              Usamos cookies para melhorar sua experiência no aplicativo. Você pode controlar as configurações de cookies em seu navegador.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              9. Contato
            </h2>
            <p className="text-sm leading-relaxed">
              Se você tiver dúvidas sobre esta Política de Privacidade, entre em contato conosco através de nossos canais de atendimento disponíveis no aplicativo.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold mb-3 text-charcoal">
              10. Alterações nesta Política
            </h2>
            <p className="text-sm leading-relaxed">
              Podemos atualizar esta política periodicamente. Notificaremos você sobre mudanças significativas através do aplicativo ou por email.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

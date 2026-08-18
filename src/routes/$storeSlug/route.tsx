import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CartProvider } from "@/lib/pizzaria2/cart";
import { MenuProvider, type MenuPayload } from "@/lib/pizzaria2/menu-provider";
import { StoreProvider, type StorePayload } from "@/lib/pizzaria2/store-provider";
import { useLiveMenu } from "@/lib/pizzaria2/use-live-menu";
import { Footer } from "@/components/site/pizzaria2/Footer";
import { Header } from "@/components/site/pizzaria2/Header";
import { getStorefrontMenuFn } from "@/server/functions/storefront-menu.fn";

export const Route = createFileRoute("/$storeSlug")({
  loader: ({ params }) => getStorefrontMenuFn({ data: { storeSlug: params.storeSlug } }),
  head: () => ({
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800;900&display=swap",
      },
    ],
  }),
  component: PizzariaLayout,
});

function PizzariaLayout() {
  const data = Route.useLoaderData() as MenuPayload & { store: StorePayload };
  useLiveMenu();

  return (
    <StoreProvider payload={data.store}>
      <MenuProvider payload={data}>
        <CartProvider>
          {/* The brand colour set in the admin overrides the palette tokens for
              this store only. Inline rather than in the stylesheet because the
              value is per tenant, and the gradient ends are derived from it so
              a single choice restyles the whole storefront consistently. */}
          <div
            className="pizzaria2 flex min-h-screen flex-col bg-cream font-sans text-charcoal"
            style={
              {
                "--tomato": data.store.primaryColor,
                "--primary": data.store.primaryColor,
                "--primary-glow": `color-mix(in oklab, ${data.store.primaryColor} 82%, white)`,
                "--primary-deep": `color-mix(in oklab, ${data.store.primaryColor} 78%, black)`,
              } as React.CSSProperties
            }
          >
            <Header />
            <div className="flex-1 pt-16.75">
              <Outlet />
            </div>
            <Footer />
          </div>
        </CartProvider>
      </MenuProvider>
    </StoreProvider>
  );
}

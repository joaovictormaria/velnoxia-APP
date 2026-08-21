export interface CompositionBuilderProps {
  storeId: string;
  productId: string;
}

export function CompositionBuilder(props: CompositionBuilderProps) {
  return (
    <div className="composition-builder space-y-4 p-4 border rounded bg-white">
      <h3 className="text-lg font-bold">Receitas/Composições</h3>
      <div className="p-4 text-center border-2 border-dashed rounded bg-neutral-50">
        <p className="text-neutral-600">
          Gerenciamento de receitas em desenvolvimento.
        </p>
        <p className="text-xs text-neutral-600 mt-2">
          Use o ID do produto: {props.productId}
        </p>
      </div>
    </div>
  );
}

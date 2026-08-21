export interface AuditLogProps {
  storeId: string;
  itemId?: string;
  referenceId?: string;
}

export function AuditLog(props: AuditLogProps) {
  return (
    <div className="audit-log space-y-4 p-4 border rounded bg-white">
      <h3 className="text-lg font-bold">Histórico de Movimentações</h3>
      <div className="p-4 text-center border-2 border-dashed rounded bg-neutral-50">
        <p className="text-neutral-600">
          Auditoria em desenvolvimento.
        </p>
        <p className="text-xs text-neutral-600 mt-2">
          Exiba histórico de movimentos aqui
        </p>
      </div>
    </div>
  );
}

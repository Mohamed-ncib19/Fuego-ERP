import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockItem } from "@fuego/shared";
import { Banner } from "@astryxdesign/core/Banner";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Text } from "@astryxdesign/core/Text";
import { Button, Modal, Skeleton } from "@/components/ui";
import { stockApi } from "@/lib/api/stock.api";
import { useStockMutations } from "@/hooks/use-stock";
import { useToast } from "@/hooks/use-toast";
import { formatMillimes, formatQty } from "@/lib/format";

/**
 * Permanent delete of a material (admin). Shows what goes with it first:
 * its stock history always, its purchase dépenses only when ticked —
 * by default their amounts stay in the books.
 */
export function DeleteMaterialDialog({
  item,
  onClose,
  onDeleted,
}: {
  item: StockItem | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const toast = useToast();
  const { remove } = useStockMutations();
  const [withExpenses, setWithExpenses] = useState(false);

  useEffect(() => setWithExpenses(false), [item?.id]);

  const usageQ = useQuery({
    queryKey: ["stock-usage", item?.id],
    queryFn: () => stockApi.usage(item!.id),
    enabled: Boolean(item),
    staleTime: 0,
  });
  const usage = usageQ.data;
  const expenseCount = usage?.expenses.length ?? 0;

  const confirm = () => {
    if (!item) return;
    remove.mutate(
      { id: item.id, deleteExpenses: withExpenses },
      {
        onSuccess: (r) => {
          toast.success(
            withExpenses && r.deleted_expenses + r.updated_expenses > 0
              ? `« ${item.name} » supprimé, avec ses dépenses d'achat`
              : `« ${item.name} » supprimé`,
          );
          onDeleted?.();
          onClose();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title={`Supprimer « ${item?.name ?? ""} » ?`}
      subtitle="Suppression définitive : le nom pourra être réutilisé."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" onClick={confirm} loading={remove.isPending} disabled={!usage}>
            Supprimer définitivement
          </Button>
        </>
      }
    >
      {usageQ.isLoading || !item ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={16} />
          <Skeleton height={16} width="70%" />
        </div>
      ) : usageQ.isError ? (
        <Banner status="error" title={(usageQ.error as Error).message} />
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text-primary">
            <li>
              L'article et son stock ({formatQty(item.quantity, item.unit)}) disparaissent de Fuego.
            </li>
            {usage!.movements > 0 && (
              <li>
                Son historique ({usage!.movements} mouvement{usage!.movements > 1 ? "s" : ""}) est effacé.
              </li>
            )}
          </ul>

          {expenseCount > 0 && (
            <>
              <CheckboxInput
                label={`Supprimer aussi ${expenseCount > 1 ? `ses ${expenseCount} dépenses` : "sa dépense"} d'achat (${formatMillimes(usage!.expense_total)})`}
                description="À cocher si l'article a été créé par erreur. Sinon, les montants restent dans Finances."
                value={withExpenses}
                onChange={setWithExpenses}
              />
              <Text type="supporting" color="secondary" display="block">
                {withExpenses
                  ? `${formatMillimes(usage!.expense_total)} seront retirés des dépenses.`
                  : "Les dépenses gardent leur montant ; seule la ligne de cet article est retirée."}
              </Text>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

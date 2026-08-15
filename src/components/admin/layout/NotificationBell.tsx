import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  listNotificationsFn,
  markAllNotificationsReadFn,
} from "@/server/functions/notifications.fn";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NotificationBell() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotificationsFn(),
    refetchInterval: 15_000,
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsReadFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-10 items-center justify-center rounded-full border border-neutral-200 bg-white transition-colors hover:bg-neutral-50"
          aria-label="Notificações"
        >
          <Bell className="size-5 text-neutral-700" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#E11D2E] text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notificações</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="text-xs font-medium text-[#E11D2E] hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {data?.items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              Nenhuma notificação.
            </p>
          )}
          {data?.items.map((n) => (
            <div
              key={n.id}
              className={`border-b px-4 py-3 last:border-b-0 ${n.isRead ? "" : "bg-red-50/50"}`}
            >
              <p className="text-sm font-medium text-neutral-900">{n.title}</p>
              <p className="mt-0.5 text-xs text-neutral-600">{n.message}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { CircleX, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@admin/components/ui/alert-dialog'
import { Button } from '@admin/components/ui/button'

export function BulkActions({
  selectedCount,
  deletable,
  onDelete,
  onClearSelection,
}: {
  selectedCount: number
  /** Row-level security only grants delete on lamp_registry and lamp_id, so the
   *  destructive action is hidden rather than offered and then refused. */
  deletable: boolean
  onDelete: () => void
  onClearSelection: () => void
}) {
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      {deletable && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm" className="gap-1.5">
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes {selectedCount} record{selectedCount === 1 ? '' : 's'}. It cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>No</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Yes, delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onClearSelection}>
        <CircleX className="size-3.5" />
        Clear Selection
      </Button>
    </div>
  )
}

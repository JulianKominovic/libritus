import WritingIllustration from '@renderer/assets/illustrations/writing'
import { BaseEditorKit } from '@renderer/components/editor/editor-base-kit'
import { EditorKit } from '@renderer/components/editor/editor-kit'
import { PlateEditor } from '@renderer/components/editor/plate-editor'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Button, buttonVariants } from '@renderer/components/ui/button'
import { contextMenuVariants } from '@renderer/components/ui/context-menu'
import { EditorView } from '@renderer/components/ui/editor'
import Shortcut from '@renderer/components/ui/kbd'
import { Keys } from '@renderer/lib/keymaps'
import { Pdf, usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'
import { usePlateEditor } from 'platejs/react'
import { useRef, useState } from 'react'

function EssayItemReadOnly({ essay }: { essay: NonNullable<Pdf['essays']>[0] }) {
  const editor = usePlateEditor({
    plugins: BaseEditorKit,
    readOnly: true
  })
  return <EditorView editor={editor} value={essay.json} variant="none" className="p-2 mb-4" />
}
function EssayItemEditable({
  essay,
  editorRef
}: {
  essay: NonNullable<Pdf['essays']>[0]
  editorRef: React.RefObject<ReturnType<typeof usePlateEditor>>
}) {
  const editor = usePlateEditor({
    plugins: EditorKit,
    value: essay.json
  })
  editorRef.current = editor
  return <PlateEditor className="p-2 mb-4" editor={editor}></PlateEditor>
}

function EssayItem({
  categoryId,
  pdf,
  essay,
  isEditing: _isEditing
}: {
  categoryId: string
  pdf: Pdf
  essay: NonNullable<Pdf['essays']>[0]
  isEditing: boolean
}) {
  const [isEditing, setIsEditing] = useState(_isEditing)
  const editorRef = useRef<ReturnType<typeof usePlateEditor> | null>(null)
  const createEssay = usePdfs((state) => state.createEssay)
  const updateEssay = usePdfs((state) => state.updateEssay)
  const deleteEssay = usePdfs((state) => state.deleteEssay)

  async function handleSave() {
    if (!editorRef.current) return
    const text = editorRef.current?.api.string([])
    if (essay) {
      await updateEssay(categoryId, pdf.id, essay.id, { json: editorRef.current?.children, text })
    } else {
      await createEssay(categoryId, pdf.id, {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        json: editorRef.current?.children,
        text
      })
    }
    setIsEditing(false)
  }
  async function handleCancel() {
    setIsEditing(false)
  }

  return (
    <li
      key={essay.id}
      className="border rounded-xl bg-white pt-8 px-2 mb-8 paper-decoration"
      onDoubleClick={() => setIsEditing(true)}
      onKeyDownCapture={(e) => {
        const metaKey = e.metaKey || e.ctrlKey
        if (e.key === 'Enter' && metaKey && isEditing) {
          e.preventDefault()
          e.stopPropagation()
          handleSave()
        }
      }}
    >
      {isEditing ? (
        <EssayItemEditable essay={essay} editorRef={editorRef} />
      ) : (
        <EssayItemReadOnly essay={essay} />
      )}

      <footer className="flex items-center gap-1 h-12 border-t border-black/5 px-1">
        {isEditing ? null : (
          <time
            dateTime={new Date(essay.createdAt).toISOString()}
            className="text-xs text-morphing-500 flex-grow"
          >
            {Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(
              new Date(essay.createdAt)
            )}
          </time>
        )}

        {isEditing ? (
          <>
            <Button
              variant="ghost"
              size={'sm'}
              className="flex-grow text-xs"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size={'sm'}
              className="flex-grow text-xs"
              onClick={handleSave}
            >
              Save
              <Shortcut
                keys={[Keys.CONTROL_OR_META, Keys.ENTER]}
                className="bg-white/10 rounded text-white"
              />
            </Button>
          </>
        ) : (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className={contextMenuVariants({
                    variant: 'destructive',
                    className: 'size-8 cursor-pointer'
                  })}
                >
                  <DynamicIcon name="trash" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this essay? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>No! I want to keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({
                      variant: 'destructive'
                    })}
                    onClick={() => {
                      deleteEssay(categoryId, pdf.id, essay.id)
                    }}
                  >
                    Yes! Delete it
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="ghost"
              className="size-8 rounded-lg"
              onClick={() => {
                setIsEditing(true)
              }}
            >
              <DynamicIcon name="edit" className="size-4" />
            </Button>
          </>
        )}
      </footer>
    </li>
  )
}

function EssayTab({ pdf, categoryId }: { pdf: Pdf; categoryId: string }) {
  const createEssay = usePdfs((state) => state.createEssay)
  if (!pdf.essays || pdf.essays?.length === 0) {
    return (
      <div className="flex flex-col gap-2 justify-center items-center py-8 px-2">
        <h3 className="text-xl font-medium font-serif mb-4">Write short essays</h3>
        <WritingIllustration
          className="grayscale-100 mix-blend-luminosity saturate-0 opacity-60 w-full"
          width={200}
          height={200}
        />
        <a
          href="https://www.google.com/search?q=benefits+of+essay+writing"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-morphing-500 mb-4 underline hover:text-morphing-700 text-center"
        >
          Writing short essays can help you understand the content better.
        </a>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            createEssay(categoryId, pdf.id, {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              json: null
            })
          }}
        >
          <DynamicIcon name="plus" className="size-4" />
          Create my first essay
        </Button>
      </div>
    )
  }
  return (
    <ul className="pt-2 pb-20">
      <li
        className={buttonVariants({ variant: 'ghost', className: 'w-full mb-4' })}
        role="button"
        onClick={() => {
          createEssay(categoryId, pdf.id, {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            json: null
          })
        }}
      >
        <DynamicIcon name="plus" className="size-4" />
        Write an essay
      </li>

      {pdf.essays?.map((essay) => (
        <EssayItem
          key={essay.id}
          categoryId={categoryId}
          pdf={pdf}
          essay={essay}
          isEditing={essay.json === null}
        />
      ))}
    </ul>
  )
}

export default EssayTab

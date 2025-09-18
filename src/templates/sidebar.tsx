import { type NodeModel, Tree } from "@minoru/react-dnd-treeview";
import { DynamicIcon } from "lucide-react/dynamic";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { useDragDropManager } from "react-dnd";
import { NativeTypes } from "react-dnd-html5-backend";
import { Link, useLocation, useRoute } from "wouter";
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
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  contextMenuVariants,
} from "@/components/ui/context-menu";
import { useLang } from "@/i18n/lang-context";
import { cn } from "@/lib/utils";
import PdfCardContextMenuContent from "@/organisms/pdf/pdf-card-context-menu-content";
import { type Category, type Pdf, usePdfs } from "@/stores/categories";
import { useSettings } from "@/stores/settings";

type PdfTreeItem = Pdf & { type: "P" };
type CategoryTreeItem = Category & { type: "C" };
function TreeView({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [, params2] = useRoute("/category/:categoryId");
  const [, params3] = useRoute("/category/:categoryId/:pdfId");
  const selectedCategoryId = params2?.categoryId || params3?.categoryId;
  const selectedPdfId = params3?.pdfId;
  const categories = usePdfs((s) => s.categories);
  const treeData: NodeModel<
    CategoryTreeItem | PdfTreeItem | { type: "C" } | null
  >[] = useMemo(() => {
    const fixed: NodeModel<{ type: "C" }>[] = [
      {
        id: "add-category",
        text: "Add Category",
        data: { type: "C" },
        parent: 0,
        droppable: true,
      },
    ];
    const mappedCategories: NodeModel<CategoryTreeItem>[] = categories.map(
      (category) =>
        ({
          id: category.id,
          text: category.name,
          data: { ...category, type: "C" },
          parent: 0,
          droppable: true,
        } as NodeModel<CategoryTreeItem>)
    );
    const mappedPdfs: NodeModel<PdfTreeItem>[] = categories.flatMap(
      (category) =>
        category.pdfs.map(
          (pdf) =>
            ({
              id: pdf.id,
              text: pdf.name,
              data: { ...pdf, type: "P" },
              parent: category.id,
            } as NodeModel<PdfTreeItem>)
        )
    );
    return [...mappedCategories, ...mappedPdfs, ...fixed];
  }, [categories]);
  const createCategory = usePdfs((s) => s.createCategory);
  const [, navigate] = useLocation();
  const deleteCategory = usePdfs((s) => s.deleteCategory);

  const uploadPdf = usePdfs((s) => s.uploadPdf);
  const movePdf = usePdfs((s) => s.movePdf);
  const initialOpen = useMemo(() => {
    const openPaths = [];
    if (selectedPdfId) {
      openPaths.push(selectedPdfId);
    }
    if (selectedCategoryId) {
      openPaths.push(selectedCategoryId);
    }
    return openPaths;
  }, [selectedPdfId, selectedCategoryId]);

  // From https://codesandbox.io/p/sandbox/scroll-control-ts-4s4pq4?file=%2Fsrc%2FTreeview.tsx%3A56%2C12-67%2C6
  const manager = useDragDropManager();
  const monitor = manager.getMonitor();
  let timer: NodeJS.Timeout | number = 0;
  useEffect(() => {
    const unsubscribe = monitor.subscribeToOffsetChange(() => {
      if (timer !== 0) {
        clearInterval(timer);
      }

      if (!containerRef.current) {
        return;
      }

      const bbox = containerRef.current.getBoundingClientRect();
      const offsetTop = bbox.top + 60;
      const offsetBottom = bbox.bottom - 60;
      const clientOffset = monitor.getClientOffset();
      const diff = monitor.getDifferenceFromInitialOffset();

      if (!clientOffset || !diff) {
        return;
      }

      if (diff.y > 0 && clientOffset.y > offsetBottom) {
        const speed = clientOffset.y - offsetBottom;

        timer = setInterval(() => {
          containerRef.current!.scrollTop =
            containerRef.current!.scrollTop + speed;
        }, 10);
      }

      if (diff.y < 0 && clientOffset.y < offsetTop) {
        const speed = offsetTop - clientOffset.y;

        timer = setInterval(() => {
          containerRef.current!.scrollTop =
            containerRef.current!.scrollTop - speed;
        }, 10);
      }
    });
    return () => unsubscribe();
  }, [
    containerRef,
    monitor.getClientOffset,
    monitor.getDifferenceFromInitialOffset,
    monitor.subscribeToOffsetChange,
    timer,
  ]);

  return (
    <Tree
      tree={treeData}
      extraAcceptTypes={[NativeTypes.FILE, NativeTypes.HTML]}
      canDrag={(node) => {
        return node?.data?.type === "P";
      }}
      rootId={0}
      sort={false}
      onDrop={async (
        _,
        { monitor, dropTargetId: ogDropTargetId, dragSource }
      ) => {
        const itemType = monitor.getItemType();
        let dropTargetId = ogDropTargetId + "";
        const files: File[] = monitor.getItem().files || [];

        if (dropTargetId === "add-category") {
          const createdCategory = await createCategory();
          navigate(`/category/${createdCategory.id}`, { replace: true });
          dropTargetId = createdCategory.id;
        }

        if (itemType === NativeTypes.FILE) {
          for (const file of files) {
            console.log("File uploading", file);
            if (file?.type === "application/pdf") {
              await uploadPdf(dropTargetId as string, file);
            }
          }
        }
        if (itemType === NativeTypes.HTML) {
          console.log("Is HTML", monitor.getItem());
        }
        movePdf(
          dragSource?.parent as string,
          dragSource?.id as string,
          dropTargetId as string
        );
      }}
      initialOpen={initialOpen}
      render={(node, { depth, isOpen, onToggle, isDragging, isDropTarget }) => {
        const isPdf = node.data?.type === "P";
        // const isActive =
        //   (isPdf
        //     ? node.id === selectedPdfId
        //     : node.id === selectedCategoryId) || isOpen;
        const isActive = isOpen;
        if (isPdf) {
          const pdfNode = node.data as PdfTreeItem;
          return (
            <ContextMenu>
              <ContextMenuTrigger
                onClick={() => {
                  onToggle();
                  navigate(`/category/${node.parent}/${pdfNode.id}`, {
                    replace: true,
                  });
                }}
                className={cn(
                  buttonVariants({ variant: "none" }),
                  "w-full justify-start ml-auto !p-0 h-auto mb-2 whitespace-pre-line line-clamp-2",
                  isActive ? "font-semibold active" : "",
                  isDragging ? "animate-[pulse_1s_ease-in-out_infinite]" : ""
                )}
                style={{
                  width: `calc(100% - ${depth * 24}px)`,
                }}
              >
                {pdfNode.name}
              </ContextMenuTrigger>
              <PdfCardContextMenuContent
                pdf={pdfNode}
                categoryId={node.parent as string}
              />
            </ContextMenu>
          );
        }
        if (node.id === "add-category") {
          return (
            <Button
              variant={"none"}
              className={cn(
                "!p-0 h-10 w-full justify-start",
                isDropTarget ? "bg-morphing-100 !px-2" : ""
              )}
              onClick={() => {
                createCategory().then((category) => {
                  navigate(`/category/${category.id}`, { replace: true });
                });
              }}
            >
              <DynamicIcon name="plus" />
              Create new category
            </Button>
          );
        }
        const categoryNode = node.data as CategoryTreeItem;
        const isDefaultCategory = categoryNode.id === "default";
        return (
          <ContextMenu>
            <ContextMenuTrigger
              className={cn(
                buttonVariants({ variant: "none" }),
                "w-full relative justify-start !p-0 h-10 line-clamp-3 flex",
                isActive ? "font-semibold active" : "",
                isDropTarget ? "bg-morphing-100 !px-2" : ""
              )}
              onClick={() => {
                onToggle();
                navigate(`/category/${node.id}`, { replace: true });
              }}
            >
              <DynamicIcon name={categoryNode.icon} size={16} />
              <p className="text-sm cursor-pointer truncate w-full text-left overflow-hidden">
                {categoryNode.name}
              </p>
              <p className="text-xs text-morphing-500 shrink-0 inline-block w-fit">
                {categoryNode.pdfs.length}
              </p>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-fit max-w-sm">
              <div className="p-2">
                <p className="text-morphing-900 flex items-center gap-2">
                  <DynamicIcon
                    className="text-morphing-900 shrink-0"
                    name={categoryNode.icon}
                    size={16}
                  />
                  {categoryNode.name}
                </p>
                <small className="text-morphing-700 pl-6 block">
                  {categoryNode.description}
                </small>
              </div>
              {isDefaultCategory ? null : <ContextMenuSeparator />}
              {isDefaultCategory ? null : (
                <ContextMenuItem asChild variant="destructive">
                  <AlertDialog>
                    <AlertDialogTrigger
                      className={contextMenuVariants({
                        variant: "destructive",
                      })}
                    >
                      <DynamicIcon name="trash" />
                      Delete category
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Are you absolutely sure?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          You are about to delete this category and all the pdfs
                          in it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          No! I want to keep it
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className={buttonVariants({
                            variant: "destructive",
                          })}
                          onClick={() => {
                            deleteCategory(categoryNode.id);
                          }}
                        >
                          Yes! Delete it
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        );
      }}
    />
  );
}

function Sidebar() {
  const { t } = useLang();
  const categories = usePdfs((s) => s.categories);
  const pdfsCount = useMemo(() => {
    return categories.reduce((acc, category) => acc + category.pdfs.length, 0);
  }, [categories]);
  const [isTrash] = useRoute("/trash");
  const [isSettings] = useRoute("/settings");
  const [isInfo] = useRoute("/info");
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar);
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <motion.aside
      layout="position"
      initial={{ opacity: 0, width: 0 }}
      animate={{
        opacity: showNavigationSidebar ? 1 : 0,
        width: showNavigationSidebar ? "260px" : "0px",
      }}
      transition={{
        duration: 0.3,
        opacity: { duration: showNavigationSidebar ? 0.3 : 0.15 },
      }}
      className="overflow-hidden h-[calc(100%-50px)]"
      style={{ minWidth: 0 }}
    >
      <div className="px-4 w-[260px] h-full grid grid-rows-[auto_1fr_auto] gap-2 content-between">
        <Link
          to="/"
          className={(isActive) =>
            cn(
              buttonVariants({ variant: "none" }),
              "w-full justify-start !p-0 mb-0",
              isActive ? "font-semibold" : ""
            )
          }
        >
          <DynamicIcon name="home" /> {t("home")}
        </Link>
        <div className="overflow-y-auto h-full min-h-0" ref={containerRef}>
          <p className="mb-2 w-full text-xs flex items-center justify-between text-morphing-500">
            <strong className="font-medium">{t("categories")} </strong>
            <span>{pdfsCount} pdfs</span>
          </p>
          <TreeView containerRef={containerRef} />
          {/* <motion.ul className="h-full">
            {categories.map((category) => {
              return (
                <SidebarItem
                  key={category.id}
                  category={category}
                  categoryId={category.id}
                ></SidebarItem>
              );
            })}
            <motion.li className="h-auto cursor-pointer">
              <Button
                variant={"none"}
                className="!p-0 h-9"
                onClick={() => {
                  createCategory().then((category) => {
                    navigate(`/category/${category.id}`, { replace: true });
                  });
                }}
              >
                <DynamicIcon name="plus" />
                Create new category
              </Button>
            </motion.li>
          </motion.ul> */}
        </div>
        <footer className="flex items-center gap-4 pb-4 pt-1">
          <Link to="/settings">
            <DynamicIcon
              size={18}
              fill={isSettings ? "var(--color-morphing-100)" : "none"}
              className={isSettings ? "text-morphing-900" : "text-morphing-400"}
              name="settings"
            />
          </Link>
          <Link to="/trash">
            <DynamicIcon
              size={18}
              fill={isTrash ? "var(--color-morphing-100)" : "none"}
              className={isTrash ? "text-morphing-900" : "text-morphing-400"}
              name="trash"
            />
          </Link>
          <Link to="/info">
            <DynamicIcon
              size={18}
              fill={isInfo ? "var(--color-morphing-100)" : "none"}
              className={isInfo ? "text-morphing-900" : "text-morphing-400"}
              name="info"
            />
          </Link>
        </footer>
      </div>
    </motion.aside>
  );
}

export default Sidebar;

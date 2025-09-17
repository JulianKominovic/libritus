import { DynamicIcon } from "lucide-react/dynamic";
import { motion } from "motion/react";
import { useMemo } from "react";
import { useDebounceCallback } from "usehooks-ts";
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
import { Input } from "@/components/ui/input";
import { useLang } from "@/i18n/lang-context";
import { cn } from "@/lib/utils";
import { type Category, type Pdf, usePdfs } from "@/stores/categories";
import { useSettings } from "@/stores/settings";
import {
  Tree,
  getBackendOptions,
  MultiBackend,
  NodeModel,
} from "@minoru/react-dnd-treeview";
import { DndProvider } from "react-dnd";
import { NativeTypes } from "react-dnd-html5-backend";

type PdfTreeItem = Pdf & { type: "P" };
type CategoryTreeItem = Category & { type: "C" };
function TreeView() {
  const [, params2] = useRoute("/category/:categoryId");
  const [, params3] = useRoute("/category/:categoryId/:pdfId");
  const selectedCategoryId = params2?.categoryId || params3?.categoryId;
  const selectedPdfId = params3?.pdfId;
  const categories = usePdfs((s) => s.categories);
  const treeData: NodeModel<CategoryTreeItem | PdfTreeItem | null>[] =
    useMemo(() => {
      const fixed: NodeModel<null>[] = [
        {
          id: "add-category",
          text: "Add Category",
          data: null,
          parent: 0,
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
  const deletePdf = usePdfs((s) => s.deletePdf);
  const updatePdf = usePdfs((s) => s.updatePdf);
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
  const debouncedUpdatePdf = useDebounceCallback((categoryId, pdfId, name) => {
    updatePdf(categoryId, pdfId, { name });
  }, 300);

  return (
    <DndProvider backend={MultiBackend} options={getBackendOptions()}>
      <Tree
        tree={treeData}
        onChangeOpen={(openPaths) => {
          console.log("openPaths", openPaths);
          //         if(categoryId!=='add-category'){
          // const [isActive] = useRoute(`/category/${categoryId}/:pdfId?`);
          //         }
        }}
        extraAcceptTypes={[
          // PDF FILES
          NativeTypes.FILE,
          // HTML PDF CARDS
          // NativeTypes.HTML,
        ]}
        canDrag={(node) => {
          return node?.data?.type === "P";
        }}
        rootId={0}
        sort={false}
        onDrop={async (
          newTree,
          { monitor, dropTargetId, dragSourceId, dragSource }
        ) => {
          const itemType = monitor.getItemType();
          console.log("ondrop", newTree, monitor, dropTargetId);
          if (itemType === NativeTypes.FILE) {
            const file: File | undefined = monitor.getItem().files[0];
            if (file?.type === "application/pdf") {
              await uploadPdf(dropTargetId as string, file);
            }
          } else {
            console.log("movePdf", dragSourceId, dragSource?.id, dropTargetId);
            movePdf(
              dragSource?.parent as string,
              dragSource?.id as string,
              dropTargetId as string
            );
          }
        }}
        initialOpen={initialOpen}
        render={(node, { depth, isOpen, onToggle }) => {
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
                    isActive ? "font-semibold active" : ""
                  )}
                  style={{
                    width: `calc(100% - ${depth * 24}px)`,
                  }}
                >
                  {pdfNode.name}
                </ContextMenuTrigger>
                <ContextMenuContent className="w-full max-w-md">
                  <Input
                    className="text-morphing-900 flex items-center gap-2 font-medium text-sm px-2 py-2 border-b mb-2 resize-none border-none rounded-b-none rounded-t-lg"
                    defaultValue={pdfNode.name}
                    onChange={(e) => {
                      debouncedUpdatePdf(
                        node.parent,
                        pdfNode.id,
                        e.target.value
                      );
                    }}
                  />
                  <ContextMenuItem
                    variant="destructive"
                    onClick={() => {
                      deletePdf(node.parent as string, pdfNode.id);
                    }}
                  >
                    <DynamicIcon name="trash" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          }
          if (node.id === "add-category") {
            return (
              <Button
                variant={"none"}
                className="!p-0 h-10"
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
                  "w-full justify-start !p-0 h-8 line-clamp-3 flex",
                  isActive ? "font-semibold active" : ""
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
                        Delete
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Are you absolutely sure?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            You are about to delete this category and all the
                            pdfs in it.
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
    </DndProvider>
  );
}

function Sidebar() {
  const { t } = useLang();
  const categories = usePdfs((s) => s.categories);
  const createCategory = usePdfs((s) => s.createCategory);
  const pdfsCount = useMemo(() => {
    return categories.reduce((acc, category) => acc + category.pdfs.length, 0);
  }, [categories]);
  const [, navigate] = useLocation();
  const [isTrash] = useRoute("/trash");
  const [isSettings] = useRoute("/settings");
  const [isInfo] = useRoute("/info");
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar);
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
        <div className="overflow-y-auto h-full min-h-0">
          <p className="mb-2 w-full text-xs flex items-center justify-between text-morphing-500">
            <strong className="font-medium">{t("categories")} </strong>
            <span>{pdfsCount} pdfs</span>
          </p>
          <TreeView />
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

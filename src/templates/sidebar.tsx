import { DynamicIcon } from "lucide-react/dynamic";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Button, buttonVariants } from "@/components/ui/button";
import { useLang } from "@/i18n/lang-context";
import { cn } from "@/lib/utils";
import { type Category, type Pdf, usePdfs } from "@/stores/categories";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  contextMenuVariants,
} from "@/components/ui/context-menu";
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

const PdfSidebarItem = ({
  pdf,
  categoryId,
  index,
}: {
  pdf: Pdf;
  categoryId: string;
  index: number;
}) => {
  const [isPdfActive] = useRoute(`/category/${categoryId}/${pdf.id}`);
  return (
    <motion.li className="cursor-pointer mb-2" {...animateInOut(index)}>
      <Link
        to={`/category/${categoryId}/${pdf.id}`}
        className={cn(
          buttonVariants({ variant: "none" }),
          "w-full justify-start !p-0 h-auto whitespace-pre-line line-clamp-2",
          isPdfActive ? "font-semibold active" : ""
        )}
      >
        {pdf.name}
      </Link>
    </motion.li>
  );
};
function animateInOut(order = 0) {
  return {
    initial: { opacity: 0, y: -10, scale: 0.95 },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.35,
        delay: order * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuart
      },
    },
    exit: {
      opacity: 0,
      y: -5,
      scale: 0.98,
      transition: {
        duration: 0.25,
        ease: [0.55, 0.06, 0.68, 0.19], // easeInQuart
      },
    },
  } as Variants;
}
function SidebarItem({
  category,
  categoryId,
}: {
  category: Category;
  categoryId: string;
}) {
  const [isActive] = useRoute(`/category/${categoryId}/:pdfId?`);
  const pdfs = category.pdfs;
  const deleteCategory = usePdfs((s) => s.deleteCategory);
  const isDefaultCategory = categoryId === "default";
  return (
    <motion.li className="mb-3 cursor-pointer">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            to={`/category/${categoryId}`}
            className={cn(
              buttonVariants({ variant: "none" }),
              "w-full justify-start p-0 h-auto mb-2 line-clamp-3",
              isActive ? "font-semibold active" : ""
            )}
          >
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 cursor-pointer w-full">
              <DynamicIcon name={category.icon} size={16} />
              <p className="text-sm cursor-pointer truncate w-full overflow-auto">
                {category.name}
              </p>
              <p className="text-xs text-morphing-500 shrink-0 inline-block w-fit">
                {category.pdfs.length}
              </p>
            </div>
          </Link>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-fit max-w-sm">
          <div className="p-2">
            <p className="text-morphing-900 flex items-center gap-2">
              <DynamicIcon
                className="text-morphing-900 shrink-0"
                name={category.icon}
                size={16}
              />
              {category.name}
            </p>
            <small className="text-morphing-700 pl-6 block">
              {category.description}
            </small>
          </div>
          {isDefaultCategory ? null : <ContextMenuSeparator />}
          {isDefaultCategory ? null : (
            <ContextMenuItem asChild variant="destructive">
              <AlertDialog>
                <AlertDialogTrigger
                  className={contextMenuVariants({ variant: "destructive" })}
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
                      You are about to delete this category and all the pdfs in
                      it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>No! I want to keep it</AlertDialogCancel>
                    <AlertDialogAction
                      className={buttonVariants({ variant: "destructive" })}
                      onClick={() => {
                        deleteCategory(categoryId);
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
      <AnimatePresence mode="wait">
        {isActive && pdfs.length > 0 && (
          <motion.ul
            className="pl-6 text-sm overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: {
                height: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
                opacity: { duration: 0.3, delay: 0.15 },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                height: { duration: 0.3, ease: [0.55, 0.06, 0.68, 0.19] },
                opacity: { duration: 0.15 },
              },
            }}
          >
            {pdfs.map((pdf, index) => {
              return (
                <PdfSidebarItem
                  index={index}
                  key={pdf.id}
                  pdf={pdf}
                  categoryId={categoryId}
                />
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.li>
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
  return (
    <aside className="px-4 overflow-x-hidden grid grid-rows-[auto_1fr_auto] h-[calc(100%-50px)] gap-2 content-between">
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
      <div className="overflow-y-auto h-full">
        <p className="mb-2 w-full text-xs flex items-center justify-between text-morphing-500">
          <strong className="font-medium">{t("categories")} </strong>
          <span>{pdfsCount} pdfs</span>
        </p>
        <motion.ul className="h-full">
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
              className="!p-0 h-12"
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
        </motion.ul>
      </div>
      <footer className="flex items-center gap-4 pb-4 pt-1">
        <Link to="/settings">
          <DynamicIcon
            size={20}
            fill={isSettings ? "var(--color-morphing-100)" : "none"}
            className={isSettings ? "text-morphing-900" : "text-morphing-400"}
            name="settings"
          />
        </Link>
        <Link to="/trash">
          <DynamicIcon
            size={20}
            fill={isTrash ? "var(--color-morphing-100)" : "none"}
            className={isTrash ? "text-morphing-900" : "text-morphing-400"}
            name="trash"
          />
        </Link>
        <Link to="/info">
          <DynamicIcon
            size={20}
            fill={isInfo ? "var(--color-morphing-100)" : "none"}
            className={isInfo ? "text-morphing-900" : "text-morphing-400"}
            name="info"
          />
        </Link>
      </footer>
    </aside>
  );
}

export default Sidebar;

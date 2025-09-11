import { HomeIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Button, buttonVariants } from "@/components/ui/button";
import { useLang } from "@/i18n/lang-context";
import { cn } from "@/lib/utils";
import { type Category, type Pdf, usePdfs } from "@/stores/categories";
import { AnimatePresence, motion, Variants } from "motion/react";
import { DynamicIcon } from "lucide-react/dynamic";

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
  return (
    <motion.li className="mb-2 cursor-pointer">
      <Link
        to={`/category/${categoryId}`}
        className={cn(
          buttonVariants({ variant: "none" }),
          "w-full justify-start p-0 h-auto mb-2 line-clamp-3",
          isActive ? "font-semibold active" : ""
        )}
      >
        <div className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm cursor-pointer">
            <DynamicIcon name={category.icon} size={16} />
          </span>
          <span className="text-sm cursor-pointer">{category.name}</span>
        </div>
      </Link>
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
  return (
    <aside className="px-4 overflow-x-hidden">
      <Link
        to="/"
        className={(isActive) =>
          cn(
            buttonVariants({ variant: "none" }),
            "mb-4 w-full justify-start !p-0",
            isActive ? "font-semibold" : ""
          )
        }
      >
        <HomeIcon /> {t("home")}
      </Link>
      <p className="mb-2 w-full text-xs flex items-center justify-between text-morphing-500">
        <strong className="font-medium">{t("categories")} </strong>
        <span>{pdfsCount} pdfs</span>
      </p>
      <motion.ul>
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
            <PlusIcon />
            Create new category
          </Button>
        </motion.li>
      </motion.ul>
    </aside>
  );
}

export default Sidebar;

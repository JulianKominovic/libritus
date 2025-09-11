import { motion } from "motion/react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/i18n/lang-context";
import { usePdfs } from "@/stores/categories";

function fadeInOut(order = 0) {
  return {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.5, delay: order * 0.1 },
  };
}

function HomePage() {
  const { t } = useLang();
  const categories = usePdfs((s) => s.categories);
  const pdfsCount = useMemo(() => {
    return Array.from(categories.values()).reduce(
      (acc, category) => acc + category.pdfs.length,
      0
    );
  }, [categories]);
  return (
    <motion.main className="p-4 mx-auto max-w-4xl select-none cursor-default">
      <motion.h1
        className="text-6xl font-serif font-bold text-center"
        {...fadeInOut()}
      >
        {t("home_welcome")}
      </motion.h1>
      <motion.h2
        className="text-2xl px-2 font-sans text-muted-foreground font-medium mb-16 text-center"
        {...fadeInOut(1)}
      >
        {t("home_welcome_description")}
      </motion.h2>
      <section>
        <ul className="flex flex-wrap gap-6">
          <motion.li
            className="flex flex-col items-center flex-grow w-64"
            {...fadeInOut(2)}
          >
            <Badge className="rounded-[50%] size-10 text-2xl font-serif mb-4">
              1
            </Badge>
            <h3 className="text-xl font-serif text-center mb-1">
              Upload a PDF
            </h3>
            <p className="text-muted-foreground text-center">
              Drag and drop the file anywhere on the screen or drop it in any of
              the categories.
            </p>
          </motion.li>
          <motion.li
            className="flex flex-col items-center flex-grow w-64"
            {...fadeInOut(3)}
          >
            <Badge className="rounded-[50%] size-10 text-2xl font-serif mb-4">
              2
            </Badge>
            <h3 className="text-xl font-serif text-center mb-1">
              Create a new category
            </h3>
            <p className="text-muted-foreground text-center">
              Create a new category to organize your pdfs.
            </p>
          </motion.li>
          <motion.li
            className="flex flex-col items-center flex-grow w-64"
            {...fadeInOut(4)}
          >
            <Badge className="rounded-[50%] size-10 text-2xl font-serif mb-4">
              3
            </Badge>
            <h3 className="text-xl font-serif text-center mb-1">
              Start reading
            </h3>
            <p className="text-muted-foreground text-center">
              Click on the category you want to read and start reading.
            </p>
          </motion.li>
        </ul>
      </section>
    </motion.main>
  );
}

export default HomePage;

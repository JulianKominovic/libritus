import { ChevronDown, SettingsIcon, User2Icon } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Fragment } from "react/jsx-runtime";
import { Link, useRoute } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLang } from "@/i18n/lang-context";
import { usePdfs } from "@/stores/categories";
import { DynamicIcon } from "lucide-react/dynamic";

type Segment =
  | ("home" | "category" | "pdf" | "settings" | "profile")
  | (string & {});
function Navbar() {
  const { t } = useLang();
  const [isHome, params] = useRoute("/");
  const [isCategory, params2] = useRoute("/category/:categoryId");
  const [isPdf, params3] = useRoute("/category/:categoryId/:pdfId");
  console.log("location", location);

  const categories = usePdfs((s) => s.categories);
  const segments = useMemo<
    {
      name: string | ReactNode;
      href: string;
      suggestions: { id?: string; name?: string | ReactNode; href: string }[];
    }[]
  >(() => {
    if (isHome) {
      return [{ name: "home", href: "", suggestions: [] }];
    }
    if (isCategory) {
      const category = categories.find((c) => c.id === params2.categoryId);
      return [
        { name: "home", href: "", suggestions: [] },
        {
          name: category?.name || "",
          href: `/category/${category?.id}`,
          suggestions: categories.map((c) => {
            return {
              id: c.id,
              name: (
                <div className="text-sm flex items-center gap-2">
                  <DynamicIcon
                    name={c.icon}
                    size={16}
                    className="text-morphing-900"
                  />
                  {c.name}
                </div>
              ),
              href: `/category/${c.id}`,
            };
          }),
        },
      ];
    }
    if (isPdf) {
      const category = categories.find((c) => c.id === params3.categoryId);
      const pdf = category?.pdfs.find((p) => p.id === params3.pdfId);
      const pdfs = category?.pdfs || [];
      return [
        { name: "home", href: "", suggestions: [] },
        {
          name: category?.name || "",
          href: `/category/${category?.id}`,
          suggestions: categories.map((c) => {
            return {
              id: c.id,
              name: (
                <div className="text-sm flex items-center gap-2">
                  <DynamicIcon
                    name={c.icon}
                    size={16}
                    className="text-morphing-900"
                  />
                  {c.name}
                </div>
              ),
              href: `/category/${c.id}`,
            };
          }),
        },
        {
          name: pdf?.name || "",
          href: `/category/${category?.id}/${pdf?.id}`,
          suggestions: pdfs.map((p) => ({
            id: p.id,
            name: p.name,
            href: `/category/${category?.id}/${p.id}`,
          })),
        },
      ];
    }
    return [{ name: "home", href: "", suggestions: [] }];
  }, [
    isHome,
    isCategory,
    isPdf,
    params2?.categoryId,
    params3?.categoryId,
    params3?.pdfId,
    categories,
  ]);
  return (
    <nav
      data-tauri-drag-region
      className="w-full h-[50px] flex items-center justify-between px-4 pl-24"
    >
      <div>
        <Breadcrumb>
          <BreadcrumbList>
            {segments.map(({ name, suggestions, href }, index) => {
              const isLast = index === segments.length - 1;

              return (
                <Fragment key={name + "seg" + index.toString()}>
                  <BreadcrumbItem>
                    {suggestions?.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-2 ">
                          {name} <ChevronDown className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {suggestions.map(({ href, id, name }) => (
                            <DropdownMenuItem asChild key={id}>
                              <Link to={href}>{name}</Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={href}>{name}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div>
        <Button variant="ghost" size="icon" className="rounded-[50%]">
          <SettingsIcon />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-[50%]">
          <User2Icon />
        </Button>
      </div>
    </nav>
  );
}

export default Navbar;

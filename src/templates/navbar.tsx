import { DynamicIcon } from "lucide-react/dynamic";
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
import { usePdfs } from "@/stores/categories";
import { useSettings } from "@/stores/settings";

function Navbar() {
  const [isHome] = useRoute("/");
  const [isCategory, params2] = useRoute("/category/:categoryId");
  const [isPdf, params3] = useRoute("/category/:categoryId/:pdfId");
  const [isSettings] = useRoute("/settings");
  const [isTrash] = useRoute("/trash");
  const [isInfo] = useRoute("/info");
  console.log("location", location);

  const categories = usePdfs((s) => s.categories);
  const segments = useMemo<
    {
      name: string | ReactNode;
      href: string;
      suggestions: { id?: string; name?: string | ReactNode; href: string }[];
    }[]
  >(() => {
    if (isSettings) {
      return [{ name: "settings", href: "/settings", suggestions: [] }];
    }
    if (isTrash) {
      return [{ name: "trash", href: "/trash", suggestions: [] }];
    }
    if (isInfo) {
      return [{ name: "info", href: "/info", suggestions: [] }];
    }
    if (isHome) {
      return [{ name: "home", href: "/", suggestions: [] }];
    }
    if (isCategory) {
      const category = categories.find((c) => c.id === params2.categoryId);
      return [
        { name: "home", href: "/", suggestions: [] },
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
        { name: "home", href: "/", suggestions: [] },
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
    return [{ name: "home", href: "/", suggestions: [] }];
  }, [
    isHome,
    isCategory,
    isPdf,
    isSettings,
    isTrash,
    isInfo,
    params2?.categoryId,
    params3?.categoryId,
    params3?.pdfId,
    categories,
  ]);
  const setShowNavigationSidebar = useSettings(
    (s) => s.setShowNavigationSidebar
  );
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar);
  const setShowPdfOutline = useSettings((s) => s.setShowPdfOutline);
  const showPdfOutline = useSettings((s) => s.showPdfOutline);
  return (
    <nav
      data-tauri-drag-region
      className="w-full h-[50px] flex items-center justify-between px-4 pl-20"
    >
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="!p-2 aspect-square !size-8 text-muted-foreground"
          onClick={() => setShowNavigationSidebar(!showNavigationSidebar)}
        >
          <DynamicIcon
            name={showNavigationSidebar ? "panel-left" : "panel-left-open"}
          />
        </Button>
        <Breadcrumb className="overflow-x-auto">
          <BreadcrumbList className="flex-nowrap">
            {segments.map(({ name, suggestions, href }, index) => {
              const isLast = index === segments.length - 1;

              return (
                <Fragment key={name + "seg" + index.toString()}>
                  <BreadcrumbItem className="flex-shrink-0">
                    {suggestions?.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center gap-2 ">
                          {name}{" "}
                          <DynamicIcon name="chevron-down" className="size-4" />
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
                      <BreadcrumbLink asChild className="flex-shrink-0">
                        <Link to={href}>{name}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator className="flex-shrink-0" />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2">
        {isPdf && (
          <Button
            variant="ghost"
            className="!p-2 aspect-square !size-8 text-muted-foreground"
            onClick={() => setShowPdfOutline(!showPdfOutline)}
          >
            <DynamicIcon
              name={showPdfOutline ? "panel-right" : "panel-right-open"}
            />
          </Button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;

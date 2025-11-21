import * as React from "react";
import {
  Newspaper,
  Rss,
  Settings2,
  Tag,
  Shield,
  Users,
  CreditCard,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { NavUser } from "@/components/app/nav-user";
import { TuvixLogo } from "@/components/app/tuvix-logo";
import { CategoryBadge } from "@/components/ui/category-badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/animate-ui/components/radix/sidebar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
import { useCategories, useSubscriptions } from "@/lib/hooks/useData";
import { useCurrentUser } from "@/lib/hooks/useAuth";
import { FeedAvatar } from "@/components/app/feed-avatar";
import { ChevronRight } from "lucide-react";
import { useLocation } from "@tanstack/react-router";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: categories } = useCategories();
  const { data: subscriptionsData } = useSubscriptions();
  const { data: sessionData, isLoading: isUserLoading } = useCurrentUser();
  const location = useLocation();
  // Better Auth's useSession() returns {data: {user, session}, ...}
  const user = sessionData?.user;

  // Get current search params from URL
  const currentCategoryId = location.search?.category_id
    ? Number(location.search.category_id)
    : undefined;
  const currentSubscriptionId = location.search?.subscription_id
    ? Number(location.search.subscription_id)
    : undefined;

  // Get top 10 categories - ensure they're arrays and filter out any with undefined id or name
  const topCategories = Array.isArray(categories)
    ? categories
        .filter(
          (
            category,
          ): category is typeof category & { id: number; name: string } =>
            category.id !== undefined && category.name !== undefined,
        )
        .slice(0, 10)
    : [];

  // Get top 10 subscriptions
  const subscriptions = subscriptionsData?.items || [];
  const topSubscriptions = subscriptions.slice(0, 10);

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <Link
          to="/app"
          className="flex items-center gap-2 px-2 py-1 hover:no-underline group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <div className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
            <TuvixLogo className="size-5" />
          </div>
          <span className="font-semibold group-data-[state=collapsed]:hidden">
            TuvixRSS
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {/* Feed Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Feed</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/app/articles" search={{ category_id: undefined }}>
                    <Newspaper />
                    <span>Articles</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <Accordion
                  type="single"
                  defaultValue="subscriptions"
                  collapsible
                >
                  <AccordionItem value="subscriptions">
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <AccordionTrigger
                          showArrow={false}
                          className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&[data-state=open]>svg:last-child]:rotate-90 [&[data-state=open]>svg:not(:last-child)]:!rotate-0"
                        >
                          <Rss />
                          <span>Subscriptions</span>
                          <ChevronRight className="ml-auto transition-transform" />
                        </AccordionTrigger>
                      </SidebarMenuItem>
                    </SidebarMenu>
                    <AccordionContent>
                      <SidebarMenuSub>
                        {/* All Subscriptions - clears filter */}
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={currentSubscriptionId === undefined}
                          >
                            <Link
                              to="/app/articles"
                              search={{
                                category_id: undefined,
                                subscription_id: undefined,
                              }}
                            >
                              <span>All Subscriptions</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>

                        {/* Top 10 Subscriptions */}
                        {topSubscriptions.map((sub) => {
                          const subscriptionTitle =
                            sub.customTitle || sub.source?.title || "Untitled";
                          const isActive = currentSubscriptionId === sub.id;

                          return (
                            <SidebarMenuSubItem key={sub.id}>
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <Link
                                  to="/app/articles"
                                  search={
                                    isActive
                                      ? {
                                          category_id: currentCategoryId,
                                          subscription_id: undefined,
                                        }
                                      : {
                                          category_id: currentCategoryId,
                                          subscription_id: sub.id,
                                        }
                                  }
                                >
                                  <FeedAvatar
                                    feedName={subscriptionTitle}
                                    iconUrl={sub.source?.iconUrl}
                                    feedUrl={sub.source?.url}
                                    size="xs"
                                    className="rounded-md"
                                  />
                                  <span className="truncate">
                                    {subscriptionTitle}
                                  </span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}

                        {/* View More */}
                        {subscriptions.length > 10 && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild>
                              <Link to="/app/subscriptions">
                                <span className="font-semibold">
                                  View More →
                                </span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Categories */}
        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SidebarGroupContent>
            <Accordion type="single" defaultValue="categories" collapsible>
              <AccordionItem value="categories">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <AccordionTrigger
                      showArrow={false}
                      className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&[data-state=open]>svg]:rotate-90 flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0"
                    >
                      <Tag />
                      <span>Categories</span>
                      <ChevronRight className="ml-auto transition-transform" />
                    </AccordionTrigger>
                  </SidebarMenuItem>
                </SidebarMenu>
                <AccordionContent>
                  <SidebarMenuSub>
                    {topCategories.map((category) => (
                      <SidebarMenuSubItem key={category.id}>
                        <SidebarMenuSubButton asChild>
                          <Link
                            to="/app/articles"
                            search={{ category_id: category.id }}
                          >
                            <CategoryBadge
                              category={category}
                              className="text-xs"
                              variant="outline"
                            />
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild>
                        <Link to="/app/categories">
                          <span className="font-semibold">View All →</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Management */}
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/app/feeds">
                    <Rss />
                    <span>Public Feeds</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/app/settings">
                    <Settings2 />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Section - Only visible to admin users */}
        {user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/app/admin">
                      <Shield />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/app/admin/users">
                      <Users />
                      <span>Users</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/app/admin/plans">
                      <CreditCard />
                      <span>Plans</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link to="/app/admin/settings">
                      <Settings2 />
                      <span>Admin Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} isLoading={isUserLoading} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

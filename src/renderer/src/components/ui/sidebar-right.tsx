import { DynamicIcon } from 'lucide-react/dynamic'
import type * as React from 'react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator
} from '@renderer/components//ui/sidebar'

export function SidebarRight({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="none" className="sticky top-0 hidden h-svh border-l lg:flex" {...props}>
      <SidebarHeader className="border-sidebar-border h-16 border-b">
        {/* <NavUser user={data.user} /> */}
      </SidebarHeader>
      <SidebarContent>
        <SidebarSeparator className="mx-0" />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <DynamicIcon name="plus" />
              <span>New Calendar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

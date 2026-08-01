import { Users, ShieldCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import UsersPanel from './UsersPanel';
import RoleAccessPanel from './RoleAccessPanel';

const UserManagementPage = () => {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">User Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every user who signs up appears here. Assign roles to approve them and configure what each
          role can access.
        </p>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="access" className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Roles &amp; Access
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="access">
          <RoleAccessPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UserManagementPage;

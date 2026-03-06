import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

export default function TabsExample() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">A quick overview of your account activity.</TabsContent>
      <TabsContent value="details">Detailed information about your recent updates.</TabsContent>
      <TabsContent value="settings">Manage your preferences and notifications.</TabsContent>
    </Tabs>
  );
}

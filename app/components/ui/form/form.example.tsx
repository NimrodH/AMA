import { useForm } from "react-hook-form";
import { Button } from "../button/button";
import { Input } from "../input/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";

type FormValues = {
  name: string;
  email: string;
};

export default function FormExample() {
  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      email: "",
    },
  });

  const onSubmit = (values: FormValues) => {
    console.log("Form submitted:", values);
  };

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <FormField
          control={form.control}
          name="name"
          rules={{ required: true }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Ada Lovelace" {...field} />
              </FormControl>
              <FormDescription>Your full name as it will appear publicly.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          rules={{
            required: true,
            pattern: {
              value: /^\S+@\S+$/,
              message: "Please enter a valid email.",
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="ada@example.com" type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Save profile</Button>
      </form>
    </Form>
  );
}

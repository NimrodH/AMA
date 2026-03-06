import { Section } from "@dazl/component-gallery";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

export default function AvatarExample() {
  return (
    <>
      <Section layout="row">
        <Section.Title>Basic Avatars</Section.Title>

        <Avatar>
          <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
          <AvatarFallback>CN</AvatarFallback>
        </Avatar>

        <Avatar>
          <AvatarImage src="https://github.com/vercel.png" alt="@vercel" />
          <AvatarFallback>VC</AvatarFallback>
        </Avatar>

        <Avatar>
          <AvatarImage src="https://github.com/reactjs.png" alt="@reactjs" />
          <AvatarFallback>RC</AvatarFallback>
        </Avatar>

        <Avatar>
          <AvatarFallback>JS</AvatarFallback>
        </Avatar>

        <Avatar>
          <AvatarFallback>⚡️</AvatarFallback>
        </Avatar>
      </Section>

      <Section layout="row">
        <Section.Title>Different Sizes</Section.Title>

        <Avatar style={{ width: "24px", height: "24px" }}>
          <AvatarImage src="https://github.com/shadcn.png" alt="Small" />
          <AvatarFallback style={{ fontSize: "10px" }}>XS</AvatarFallback>
        </Avatar>

        <Avatar style={{ width: "32px", height: "32px" }}>
          <AvatarImage src="https://github.com/vercel.png" alt="Medium" />
          <AvatarFallback style={{ fontSize: "12px" }}>SM</AvatarFallback>
        </Avatar>

        <Avatar>
          <AvatarImage src="https://github.com/reactjs.png" alt="Default" />
          <AvatarFallback>MD</AvatarFallback>
        </Avatar>

        <Avatar style={{ width: "56px", height: "56px" }}>
          <AvatarImage src="https://github.com/nodejs.png" alt="Large" />
          <AvatarFallback style={{ fontSize: "18px" }}>LG</AvatarFallback>
        </Avatar>

        <Avatar style={{ width: "80px", height: "80px" }}>
          <AvatarImage src="https://github.com/microsoft.png" alt="Extra Large" />
          <AvatarFallback style={{ fontSize: "24px" }}>XL</AvatarFallback>
        </Avatar>
      </Section>
    </>
  );
}

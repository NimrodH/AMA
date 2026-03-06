import { Home } from "lucide-react";
import { Section } from "@dazl/component-gallery";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSelected,
  BreadcrumbSeparator,
} from "./breadcrumb";

export default function BreadcrumbExample() {
  return (
    <>
      <Section layout="column">
        <Section.Title>Basic Breadcrumb</Section.Title>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/gallery">Gallery</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbSelected>Photos</BreadcrumbSelected>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>

      <Section layout="column">
        <Section.Title>Custom Separators</Section.Title>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">
                <Home size={16} />
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span>→</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href="/gallery">Gallery</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span>→</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbSelected>Photos</BreadcrumbSelected>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>
    </>
  );
}

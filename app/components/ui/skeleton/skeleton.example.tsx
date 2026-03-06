import { Section } from "@dazl/component-gallery";
import { Skeleton } from "./skeleton";

export default function SkeletonExample() {
  return (
    <>
      <Section layout="column">
        <Section.Title>Basic Skeletons</Section.Title>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <Skeleton style={{ height: 40, width: 40, borderRadius: 40 }} />
            <div style={{ display: "grid", gap: 12 }}>
              <Skeleton style={{ height: 16, width: 220 }} />
              <Skeleton style={{ height: 16, width: 165 }} />
            </div>
          </div>

          <Skeleton style={{ height: 16, width: 260 }} />
          <Skeleton style={{ height: 16, width: 220 }} />
        </div>
      </Section>

      <Section layout="column">
        <Section.Title>Card Preview</Section.Title>

        <div style={{ display: "grid", gap: 12 }}>
          <Skeleton style={{ height: 160, width: 320 }} />
          <Skeleton style={{ height: 16, width: 280 }} />
          <Skeleton style={{ height: 16, width: 220 }} />
        </div>
      </Section>
    </>
  );
}

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SUPPORT_URL } from "@/lib/utils";
import { SupportLink } from "@/components/ui/support-link";

describe("SUPPORT_URL", () => {
  it("is a string constant", () => {
    expect(typeof SUPPORT_URL).toBe("string");
  });

  it("points to the official Trakteer URL", () => {
    expect(SUPPORT_URL).toBe("https://trakteer.id/eiaiproject/tip");
  });

  it("uses HTTPS protocol", () => {
    expect(SUPPORT_URL).toMatch(/^https:\/\//);
  });
});

describe("SupportLink", () => {
  describe("security attributes", () => {
    it("renders with SUPPORT_URL as href", () => {
      render(<SupportLink />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", SUPPORT_URL);
    });

    it("opens link in a new tab", () => {
      render(<SupportLink />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("includes noopener noreferrer for security", () => {
      render(<SupportLink />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  describe("accessibility", () => {
    it("has an accessible label that mentions new tab", () => {
      render(<SupportLink />);
      const link = screen.getByRole("link");
      const ariaLabel = link.getAttribute("aria-label");
      expect(ariaLabel).toContain("terbuka di tab baru");
    });

    it("renders as a semantic link element", () => {
      render(<SupportLink />);
      const link = screen.getByRole("link");
      expect(link.tagName).toBe("A");
    });

    it("has a data-placement attribute for analytics", () => {
      render(<SupportLink placement="landing" />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("data-placement", "landing");
    });
  });

  describe("placement variant", () => {
    it.each([
      ["footer", undefined],
      ["landing", "landing" as const],
      ["app_menu", "app_menu" as const],
      ["value_moment", "value_moment" as const],
    ])("defaults data-placement to %s", (expected, placement) => {
      const props = placement ? { placement } : {};
      render(<SupportLink {...props} />);
      expect(screen.getByRole("link")).toHaveAttribute("data-placement", expected);
    });
  });

  describe("default labels per placement", () => {
    it.each([
      ["landing", "Dukung Ledjer di Trakteer"],
      ["footer", "Dukung pengembangan Ledjer"],
      ["app_menu", "Traktir pengembang"],
      ["value_moment", "Dukung Ledjer"],
    ] as const)("placement %s defaults to %s", (placement, expected) => {
      render(<SupportLink placement={placement} />);
      expect(screen.getByRole("link")).toHaveTextContent(expected);
    });
  });

  describe("custom label", () => {
    it("overrides the default label when provided", () => {
      render(<SupportLink label="Dukung kami" />);
      expect(screen.getByRole("link")).toHaveTextContent("Dukung kami");
      // Accessible label should include the custom label
      expect(screen.getByRole("link")).toHaveAttribute(
        "aria-label",
        "Dukung kami — terbuka di tab baru",
      );
    });
  });

  describe("external link icon", () => {
    it("renders an SVG icon by default", () => {
      const { container } = render(<SupportLink />);
      const svg = container.querySelector("svg");
      expect(svg).toBeTruthy();
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });

    it("hides the SVG icon when hideIcon is true", () => {
      const { container } = render(<SupportLink hideIcon />);
      expect(container.querySelector("svg")).toBeNull();
    });
  });

  describe("visual variants", () => {
    it('applies link variant classes by default', () => {
      render(<SupportLink />);
      const link = screen.getByRole("link");
      // link variant has underline-offset-4
      expect(link.className).toContain("underline-offset-4");
    });

    it.each([
      ["primary", "bg-wood-500"],
      ["secondary", "bg-cream-50"],
      ["outline", "border-wood-300"],
      ["ghost", "hover:bg-cream-100"],
    ] as const)('applies %s variant classes', (variant, expectedClass) => {
      render(<SupportLink variant={variant} />);
      const link = screen.getByRole("link");
      expect(link.className).toContain(expectedClass);
    });
  });

  describe("custom className", () => {
    it("merges with existing classes", () => {
      render(<SupportLink className="extra-class" />);
      const link = screen.getByRole("link");
      expect(link.className).toContain("extra-class");
      // Still has default classes
      expect(link.className).toContain("underline-offset-4");
    });
  });

  describe("extra props", () => {
    it("passes through additional anchor attributes", () => {
      render(<SupportLink id="test-support" data-testid="support" />);
      const link = screen.getByTestId("support");
      expect(link).toHaveAttribute("id", "test-support");
    });
  });
});

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
    it('defaults to "footer" placement', () => {
      render(<SupportLink />);
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("data-placement", "footer");
    });

    it('sets data-placement to "landing"', () => {
      render(<SupportLink placement="landing" />);
      expect(screen.getByRole("link")).toHaveAttribute("data-placement", "landing");
    });

    it('sets data-placement to "app_menu"', () => {
      render(<SupportLink placement="app_menu" />);
      expect(screen.getByRole("link")).toHaveAttribute("data-placement", "app_menu");
    });

    it('sets data-placement to "value_moment"', () => {
      render(<SupportLink placement="value_moment" />);
      expect(screen.getByRole("link")).toHaveAttribute("data-placement", "value_moment");
    });
  });

  describe("default labels per placement", () => {
    it('landing defaults to "Dukung Ledjer di Trakteer"', () => {
      render(<SupportLink placement="landing" />);
      expect(screen.getByRole("link")).toHaveTextContent("Dukung Ledjer di Trakteer");
    });

    it('footer defaults to "Dukung pengembangan Ledjer"', () => {
      render(<SupportLink placement="footer" />);
      expect(screen.getByRole("link")).toHaveTextContent("Dukung pengembangan Ledjer");
    });

    it('app_menu defaults to "Traktir pengembang"', () => {
      render(<SupportLink placement="app_menu" />);
      expect(screen.getByRole("link")).toHaveTextContent("Traktir pengembang");
    });

    it('value_moment defaults to "Dukung Ledjer"', () => {
      render(<SupportLink placement="value_moment" />);
      expect(screen.getByRole("link")).toHaveTextContent("Dukung Ledjer");
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

    it('applies primary variant classes', () => {
      render(<SupportLink variant="primary" />);
      const link = screen.getByRole("link");
      expect(link.className).toContain("bg-wood-500");
    });

    it('applies secondary variant classes', () => {
      render(<SupportLink variant="secondary" />);
      const link = screen.getByRole("link");
      expect(link.className).toContain("bg-cream-50");
    });

    it('applies outline variant classes', () => {
      render(<SupportLink variant="outline" />);
      const link = screen.getByRole("link");
      expect(link.className).toContain("border-wood-300");
    });

    it('applies ghost variant classes', () => {
      render(<SupportLink variant="ghost" />);
      const link = screen.getByRole("link");
      expect(link.className).toContain("hover:bg-cream-100");
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

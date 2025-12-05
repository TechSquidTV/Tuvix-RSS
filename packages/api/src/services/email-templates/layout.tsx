import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import * as React from "react";

interface EmailLayoutProps {
  children: React.ReactNode;
  preview?: string;
  appUrl?: string;
  showFooter?: boolean;
}

/**
 * Shared email layout component
 * Provides consistent branding, styling, and footer across all email templates
 */
export const EmailLayout: React.FC<Readonly<EmailLayoutProps>> = ({
  children,
  preview,
  appUrl = "http://localhost:5173",
  showFooter = true,
}) => {
  // SVG logo as data URI - works in preview and production
  const logoSvgDataUri =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDY3LjkgMzUiPjxwYXRoIGQ9Ik0zMy45LDBjLTguOSwwLTE3LjMsMy40LTIzLjYsOS42QzMuOSwxNS44LjMsMjQsMCwzMi45YzAsLjUuMiwxLjEuNiwxLjUuNC40LjkuNiAxLjUuNmgzYzEuMSwwLDItLjksMi0yLC4yLTcsMy4yLTEzLjUsOC4yLTE4LjQsNS4xLTQuOSwxMS43LTcuNiwxOC43LTcuNnMxMy43LDIuNywxOC43LDcuNmM1LDQuOSw4LDExLjQsOC4yLDE4LjQsMCwxLjEuOSwyLDIsMmgzYy42LDAsMS4xLS4yLDEuNS0uNi40LS40LjYtLjkuNi0xLjUtLjMtOC44LTMuOS0xNy4xLTEwLjMtMjMuM0M1MS4yLDMuNCw0Mi44LDAsMzMuOSwwaDBaIi8+PHBhdGggZD0iTTMzLjksMTEuOGMtMTEuOCwwLTIxLjUsOS4yLTIyLjEsMjEsMCwuNS4yLDEuMS42LDEuNXMuOS42LDEuNS42aDNjMS4xLDAsMi0uOCwyLTEuOS41LTgsNy4xLTE0LjIsMTUuMS0xNC4yczE0LjYsNi4yLDE1LjEsMTQuMmMwLDEuMSwxLDEuOSwyLDEuOWgzYy42LDAsMS4xLS4yLDEuNS0uNi40LS40LjYtLjkuNS0xLjUtLjYtMTEuOC0xMC4zLTIxLTIyLjEtMjFoMFoiLz48cGF0aCBkPSJNMzMuOSwyNi40Yy0zLjYsMC02LjgsMi42LTcuNCw2LjItLjEuNiwwLDEuMi40LDEuNi40LjUsMSwuNywxLjYuN2gxMC44Yy42LDAsMS4yLS4zLDEuNi0uNy40LS41LjUtMS4xLjQtMS43LS43LTMuNS0zLjgtNi4xLTcuNC02LjFoMFoiLz48cGF0aCBmaWxsPSIjZmZmIiBkPSJNMzMuOSwxdjVjMTQuNCwwLDI2LjMsMTAuOSwyNy44LDI0LjlzLjEsMS4xLjEsMS43LjYsMS4zLDEuNCwxLjNoMi4zYy43LDAsMS40LS42LDEuMy0xLjQtLjctMTcuNS0xNS4yLTMxLjYtMzIuOS0zMS42WiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0zMy45LDEyLjh2NWM4LjUsMCwxNS41LDYuNiwxNi4xLDE0LjlzLjYsMS4yLDEuMywxLjJoMi41Yy43LDAsMS4zLS42LDEuMy0xLjQtLjctMTEtOS45LTE5LjgtMjEuMS0xOS44aDBaIi8+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTQwLjMsMzIuNWMtLjctMi45LTMuMy01LjEtNi4zLTUuMXY2LjVoNS4yYy44LDAsMS4zLS43LDEuMi0xLjVaIi8+PC9zdmc+";

  // Use hosted PNG in production, SVG data URI as fallback (works in preview)
  const logoUrl =
    appUrl && appUrl !== "http://localhost:5173"
      ? `${appUrl}/icons/icon-72x72.png`
      : logoSvgDataUri;

  const defaultAppUrl = appUrl || "http://localhost:5173";

  return (
    <Html>
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                brand: "#000000",
                muted: "#666666",
              },
            },
          },
        }}
      >
        <Body className="font-sans bg-white">
          <Container className="mx-auto px-4 py-5 max-w-[600px]">
            {/* Logo Section */}
            <Section className="mt-4">
              <table
                role="presentation"
                cellSpacing="0"
                cellPadding="0"
                border={0}
                style={{ width: "100%" }}
              >
                <tr>
                  <td style={{ verticalAlign: "middle", paddingRight: "12px" }}>
                    <Img
                      src={logoUrl}
                      width="50"
                      height="26"
                      alt="TuvixRSS"
                      className="mx-0 my-0"
                    />
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <Text className="text-[20px] font-semibold text-brand m-0">
                      Tuvix
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Main Content */}
            {children}

            {/* Footer */}
            {showFooter && (
              <>
                <Hr className="mx-0 my-[26px] w-full border border-solid border-[#eaeaea]" />
                <Section>
                  <Text className="text-[12px] leading-6 text-muted">
                    You are receiving this email because you created an account
                    with Tuvix.
                    <br />
                    <Link
                      href={`${defaultAppUrl}/settings`}
                      className="font-semibold text-muted/60"
                    >
                      Manage your preferences
                    </Link>
                  </Text>
                </Section>
              </>
            )}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default EmailLayout;

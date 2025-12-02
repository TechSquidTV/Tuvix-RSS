# TuvixRSS Documentation

This directory contains comprehensive documentation for TuvixRSS, a self-hosted RSS aggregator built with tRPC, React, and TypeScript.

## Quick Start

### For New Developers

1. **[Main README](../README.md)** - Project overview and quick start
2. **[Project Integration](./project-integration.md)** - How frontend and backend connect
3. **[tRPC API Architecture](./trpc-api-architecture.md)** - Complete API reference
4. **[Deployment Guide](./deployment.md)** - Setup and deployment instructions

### For Deployment

1. **[Deployment Guide](./deployment.md)** - Complete guide for Docker Compose and Cloudflare Workers
   - Development and production workflows
   - Database migrations
   - Cron job configuration
   - Monitoring and troubleshooting

### For Feature Development

1. **[Project Integration](./project-integration.md)** - Frontend-backend communication patterns
2. **[tRPC API Architecture](./trpc-api-architecture.md)** - API structure and patterns
3. **[Authentication Guide](./developer/authentication.md)** - Auth system implementation

## Core Documentation

### Architecture & Integration

#### [Project Integration](./project-integration.md)
**Comprehensive guide to frontend-backend integration**

- Monorepo structure and package organization
- tRPC client setup and type sharing
- Authentication flow (Better Auth, login, registration)
- API communication patterns
- Development workflow
- Build and deployment process
- Environment configuration

**Use this when:**
- Setting up the development environment
- Understanding how frontend and backend communicate
- Debugging type issues between packages
- Configuring deployment

#### [tRPC API Architecture](./trpc-api-architecture.md)
**Complete reference for the tRPC API**

- Core configuration and middleware
- Authentication and authorization
- All API routers and procedures
- Deployment adapters (Express & Cloudflare)
- Type safety and file organization
- Security features and patterns

**Use this when:**
- Implementing new API endpoints
- Understanding middleware chains
- Debugging authentication issues
- Learning the API structure

### Architecture Documentation

#### [Polling and Article Updates](./architecture/polling-and-article-updates.md)
**Comprehensive guide to RSS polling and article update system**

- Scheduled polling system architecture
- Feed fetching process and error handling
- Article parsing, deduplication, and storage
- Article pruning and cleanup
- Performance characteristics and optimization
- Deployment-specific implementations (Docker vs Cloudflare)

**Use this when:**
- Understanding how RSS feeds are polled
- Debugging article update issues
- Optimizing polling performance
- Implementing custom polling logic
- Understanding article lifecycle

#### [Usage Quotas and Time Periods](./architecture/usage-quotas-and-time-periods.md)
**Usage tracking, quotas, and time period implementation**

- Usage quota system architecture
- Plan-based limits and custom overrides
- Rate limiting implementation
- Current implementation status
- Future billing cycle considerations

**Use this when:**
- Understanding usage tracking system
- Implementing billing features
- Configuring plan limits
- Understanding quota reset logic

### Deployment

#### [Deployment Guide](./deployment.md)
**Complete deployment documentation**

- Docker Compose deployment (development & production)
- Cloudflare Workers deployment
- Environment configuration
- Database migrations
- Scheduled tasks (cron)
- Monitoring and health checks
- Troubleshooting

**Use this when:**
- Setting up a new deployment
- Migrating between deployment targets
- Configuring cron jobs
- Troubleshooting deployment issues

### Developer Documentation

#### [Progressive Web App (PWA)](./developer/pwa.md)
**Comprehensive PWA implementation and configuration guide**

- Service worker configuration and caching strategies
- Manifest configuration (display modes, shortcuts, protocol handlers)
- Icon generation and customization
- Browser support and compatibility
- Troubleshooting and monitoring
- Code references and implementation details

**Use this when:**
- Configuring service worker caching
- Customizing app manifest
- Troubleshooting PWA installation issues
- Implementing PWA-specific features
- Understanding PWA technical implementation

#### [Theme System](./developer/theme-system.md)
**Comprehensive theme system implementation guide**

- Theme architecture and core concepts
- Adding new themes
- Advanced customization
- API reference
- Best practices

**Use this when:**
- Creating new themes
- Understanding theme architecture
- Customizing theme behavior
- Working with CSS variables and OKLCH colors

#### [Animated Articles](./developer/animated-articles.md)
**Animated article list implementation guide**

- Component architecture and implementation
- Animation configuration and performance optimization
- Article detection strategies
- Code references and examples

**Use this when:**
- Implementing animation features
- Understanding component architecture
- Optimizing list performance
- Customizing animation behavior

#### [Authentication & User Management](./developer/authentication.md)
**Comprehensive authentication system documentation**

- JWT-based authentication implementation
- Password security (bcrypt, complexity requirements)
- Rate limiting and brute force protection
- User roles and permissions
- Plan system and resource limits
- Account suspension
- Security audit logging
- API endpoints reference
- Database schema

**Use this when:**
- Implementing authentication features
- Understanding security measures
- Configuring user plans and limits
- Debugging auth issues

#### [Rate Limiting](./developer/rate-limiting.md)
**Complete rate limiting system guide**

- Multi-layer rate limiting architecture
- Sliding window algorithm implementation
- Storage backends (Cloudflare KV vs in-memory)
- Deployment-specific setup (Docker vs Cloudflare)
- API and public feed rate limiting
- Admin monitoring and management
- HTTP headers and client handling
- Troubleshooting and best practices

**Use this when:**
- Setting up rate limiting for new deployments
- Understanding deployment differences
- Configuring rate limits for plans
- Monitoring and troubleshooting rate limit issues
- Implementing rate limit-aware clients

#### [Public Feeds](./developer/public-feeds.md)
**Comprehensive public feeds implementation guide**

- Architecture and data flow
- RSS 2.0 generation and standards compliance
- Public URL structure and access control
- Plan-based limits and usage tracking
- Rate limiting for anonymous access
- Access logging and analytics
- Frontend implementation
- API reference and workflows
- Security and best practices

**Use this when:**
- Understanding how public feeds work
- Implementing feed creation UI
- Configuring plan limits for feeds
- Monitoring feed usage and analytics
- Troubleshooting feed issues
- Building RSS reader integrations

#### [Offline Support](./developer/offline-support.md)
**Network-aware React Query configuration and offline handling**

- Network status detection and monitoring
- QueryClient configuration for offline scenarios
- Smart retry logic with exponential backoff
- Network-aware polling queries
- Offline UI indicators and user feedback
- Service worker integration
- Best practices for offline-aware queries

**Use this when:**
- Understanding offline behavior
- Implementing network-aware queries
- Configuring query retry logic
- Testing offline scenarios
- Optimizing battery and bandwidth usage
- Handling network errors gracefully

#### [Email System](./developer/email-system.md)
**Complete transactional email system documentation**

- Email service architecture and setup (Resend)
- Email types (verification, password reset, welcome)
- Email flows and integration points
- Template development guide
- API reference and troubleshooting

**Use this when:**
- Setting up Resend email service
- Understanding email flows
- Developing new email templates
- Troubleshooting email delivery issues
- Configuring email verification

#### [Security](./developer/security.md)
**Comprehensive security documentation and best practices**

- Authentication and authorization (Better Auth, password security)
- Rate limiting strategies and deployment options
- Input validation and content security
- XSS and SQL injection prevention
- CORS configuration
- Environment variables and secret management
- Security checklist and scanning tools
- Email service overview (see [Email System Guide](./developer/email-system.md) for details)

**Use this when:**
- Understanding security measures
- Configuring secure deployments
- Reviewing security best practices
- Preparing for production deployment
- Troubleshooting security issues

### Admin & Operations

#### [Admin Guide](./guides/admin/admin-guide.md)
**Complete guide for administering a TuvixRSS instance**

- Admin access and authentication
- Global settings configuration
- Plan management and customization
- User management and account operations
- Rate limiting configuration
- Security monitoring and audit logs

**Use this when:**
- Setting up admin access
- Configuring global settings
- Managing users and plans
- Monitoring system security
- Troubleshooting admin operations

### Package Documentation

#### [Tricorder Feed Discovery Library](../packages/tricorder/README.md)
**Platform-agnostic RSS/Atom feed discovery library**

- Zero-overhead optional telemetry via dependency injection
- Works in Node.js, browsers, and Chrome extensions
- Extensible plugin-based architecture for custom discovery services
- Apple Podcasts and standard feed discovery
- Comprehensive API reference and usage examples

**Additional Documentation:**
- **[Architecture Guide](../packages/tricorder/ARCHITECTURE.md)** - Design patterns, telemetry system, performance optimizations
- **[Publishing Guide](../packages/tricorder/PUBLISHING.md)** - NPM publishing instructions and versioning
- **[Changelog](../packages/tricorder/CHANGELOG.md)** - Version history and release notes

**Use this when:**
- Implementing feed discovery in new projects
- Building browser extensions for RSS discovery
- Understanding the zero-overhead telemetry pattern
- Adding custom discovery services (YouTube, Reddit, etc.)
- Publishing updates to NPM


## Documentation by Purpose

### Understanding the Project

**Start here:**
1. [Main README](../README.md) - Project overview
2. [Project Integration](./project-integration.md) - How everything connects
3. [tRPC API Architecture](./trpc-api-architecture.md) - API structure

### Development Workflow

**Setting up:**
1. [Deployment Guide - Development](./deployment.md#development-process) - Local setup
2. [Project Integration - Development Workflow](./project-integration.md#development-workflow) - Daily workflow

**Implementing features:**
1. [tRPC API Architecture](./trpc-api-architecture.md) - API patterns
2. [Project Integration](./project-integration.md) - Frontend integration
3. [Polling and Article Updates](./architecture/polling-and-article-updates.md) - RSS polling system
4. [Authentication Guide](./developer/authentication.md) - Auth patterns
5. [Email System Guide](./developer/email-system.md) - Email service and templates
6. [Rate Limiting Guide](./developer/rate-limiting.md) - Rate limiting system
7. [Public Feeds Guide](./developer/public-feeds.md) - RSS feed generation and sharing
8. [PWA Guide](./developer/pwa.md) - Progressive Web App implementation
9. [Offline Support Guide](./developer/offline-support.md) - Network-aware queries
10. [Security Guide](./developer/security.md) - Security best practices
11. [Animated Articles Guide](./developer/animated-articles.md) - Animation features

### Deployment

**Production deployment:**
1. [Deployment Guide](./deployment.md) - Complete deployment instructions
2. [Project Integration - Environment Configuration](./project-integration.md#environment-configuration) - Config setup

## Document Status

| Document | Type | Status | Last Updated |
|----------|------|--------|--------------|
| **Core Documentation** | | | |
| Project Integration | Guide | ✅ Complete | 2025-01-13 |
| tRPC API Architecture | Reference | ✅ Complete | 2025-01-13 |
| Deployment Guide | Tutorial | ✅ Complete | 2025-01-13 |
| **Architecture Documentation** | | | |
| Polling and Article Updates | Reference | ✅ Complete | 2025-01-15 |
| Usage Quotas and Time Periods | Reference | ✅ Complete | 2025-01-15 |
| **Developer Documentation** | | | |
| Animated Articles | Reference | ✅ Complete | 2025-01-15 |
| Authentication | Reference | ✅ Complete | 2025-01-13 |
| Offline Support | Reference | ✅ Complete | 2025-01-15 |
| PWA | Reference | ✅ Complete | 2025-01-15 |
| Public Feeds | Reference | ✅ Complete | 2025-01-15 |
| Rate Limiting | Reference | ✅ Complete | 2025-01-15 |
| Email System | Reference | ✅ Complete | 2025-01-15 |
| Security | Reference | ✅ Complete | 2025-01-15 |
| Theme System | Reference | ✅ Complete | 2025-01-15 |
| **Admin & Operations** | | | |
| Admin Guide | Guide | ✅ Complete | 2025-01-15 |
| **Package Documentation** | | | |
| Tricorder README | Guide | ✅ Complete | 2025-12-02 |
| Tricorder Architecture | Reference | ✅ Complete | 2025-12-02 |
| Tricorder Changelog | Reference | ✅ Complete | 2025-12-02 |

## Planning Documents

The `planning/` directory is reserved for implementation plans and technical proposals for future enhancements. Currently empty - all previous plans have been completed.

---

## Related Documentation

### Package-Level Documentation

- **[packages/api/README.md](../packages/api/README.md)** - API package documentation
- **[packages/app/README.md](../packages/app/README.md)** - Frontend package documentation
- **[packages/tricorder/README.md](../packages/tricorder/README.md)** - Tricorder feed discovery library
- **[packages/tricorder/ARCHITECTURE.md](../packages/tricorder/ARCHITECTURE.md)** - Tricorder architecture and design patterns
- **[packages/tricorder/CHANGELOG.md](../packages/tricorder/CHANGELOG.md)** - Tricorder version history

### External Resources

- [tRPC Documentation](https://trpc.io) - tRPC framework docs
- [Drizzle ORM](https://orm.drizzle.team) - Database ORM docs
- [Cloudflare Workers](https://developers.cloudflare.com/workers) - Workers runtime docs
- [TanStack Query](https://tanstack.com/query) - React Query library docs
- [TanStack Router](https://tanstack.com/router) - Router library docs

## Contributing to Documentation

When adding new documentation:

1. **Choose the right location:**
   - Root level: Core architecture, integration, deployment guides
   - `architecture/`: System architecture and design documentation
   - `developer/`: Technical implementation reference docs
   - `guides/admin/`: Admin and operations guides

2. **Follow naming conventions:**
   - All documentation files: `kebab-case.md` (e.g., `deployment.md`, `trpc-api-architecture.md`, `authentication.md`)
   - Be descriptive and specific

3. **Document structure:**
   - Include a table of contents
   - Use consistent heading levels
   - Add code examples with proper syntax highlighting
   - Include cross-references to related docs

4. **Update this README:**
   - Add to the appropriate section
   - Update the status table
   - Add navigation links

5. **Cross-link documents:**
   - Link to related docs within your document
   - Update related docs to link back

## Documentation Standards

### Formatting

- **Headers**: Use descriptive headers with proper hierarchy
- **Code blocks**: Include language tags and file paths when referencing code
- **Links**: Use relative paths for internal links
- **Tables**: Use markdown tables for structured data

### Content

- **Clarity**: Write clearly and concisely
- **Examples**: Include practical code examples
- **Completeness**: Cover all relevant aspects of the topic
- **Accuracy**: Keep documentation up-to-date with code changes

### Maintenance

- **Review**: Review docs when making related code changes
- **Update**: Update "Last Updated" dates when modifying docs
- **Archive**: Move outdated docs to `archive/` subdirectory
- **Remove**: Only remove docs if completely superseded

---

**Last Updated:** 2025-12-02
**Maintained By:** TuvixRSS Team

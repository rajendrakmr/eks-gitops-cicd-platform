# Contributing to EKS GitOps CI/CD Platform

Thank you for your interest in contributing to this project! Contributions, bug reports, documentation improvements, and suggestions are welcome.

## 1. Code of Conduct

Be respectful, constructive, and professional when interacting with other contributors. Provide actionable feedback and help maintain a collaborative environment.

## 2. Before You Start

Before contributing, make sure you have the relevant tools installed for your changes:

- Git and GitHub
- Docker and Docker Compose
- Terraform
- kubectl
- AWS CLI (for AWS-related testing)
- A Kubernetes environment such as a local cluster or Amazon EKS

Install only the tools required for the part of the project you are working on.

## 3. Find or Report an Issue

Before starting major work:

1. Check existing GitHub Issues and Pull Requests.
2. Open an issue to discuss significant changes.
3. Clearly describe bugs, expected behavior, actual behavior, and steps to reproduce the problem.

Small documentation fixes can generally be submitted directly as a Pull Request.

## 4. Development Workflow

Create a feature branch instead of committing directly to `main`.

```bash
git checkout main
git pull origin main
git checkout -b feat/add-terraform-validation
```

Make your changes, run the appropriate checks, and commit your work.

```bash
git add .
git commit -m "feat: add Terraform validation"
git push -u origin feat/add-terraform-validation
```

Open a Pull Request targeting the `main` branch.

## 5. Branch Naming Convention

Use descriptive branch names:

- `feat/short-description` — new features
- `fix/short-description` — bug fixes
- `docs/short-description` — documentation
- `ci/short-description` — CI/CD changes
- `infra/short-description` — Terraform or infrastructure changes
- `security/short-description` — security improvements

Examples:

- `feat/add-eks-autoscaling`
- `fix/terraform-state-locking`
- `docs/update-deployment-guide`
- `ci/add-trivy-scan`

## 6. Commit Message Convention

Write clear commit messages using the following format:

```text
type: short description
```

Common types:

- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation
- `ci`: CI/CD pipeline changes
- `infra`: infrastructure changes
- `test`: tests
- `refactor`: code restructuring
- `security`: security improvements

Examples:

```text
feat: add Argo CD application configuration
fix: correct Kubernetes readiness probe
docs: update EKS deployment instructions
ci: add container image scanning
infra: add private EKS worker subnets
```

## 7. Testing and Validation

Run the checks relevant to your changes before submitting a Pull Request.

### Terraform

```bash
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform plan
```

Run these commands from the relevant Terraform root module. A plan may require AWS credentials and backend configuration; review it before applying changes.

### Kubernetes

Validate your manifests using the tools configured in the repository.

```bash
kubectl apply --dry-run=client -f k8s/
kubectl get pods -A
```

The dry-run command must be adjusted if manifests depend on Kustomize, Helm, or other rendering steps.

### Docker

```bash
docker compose config
docker compose build
```

### Application and CI/CD

- Run relevant unit and integration tests.
- Check GitHub Actions workflow results.
- Validate container images and dependencies using the configured security scanners.
- Update tests and documentation when behavior changes.

Do not claim a check passed unless you actually ran it or verified its result.

## 8. Infrastructure and Security Guidelines

- Never commit AWS access keys, passwords, tokens, private keys, kubeconfig files, or real `.env` files.
- Use GitHub Actions OIDC and least-privilege IAM permissions where supported.
- Keep sensitive values in approved secret-management systems.
- Use Terraform remote state and access controls appropriately.
- Avoid destructive changes to shared or production infrastructure.
- Never run `terraform apply` or destroy production resources without explicit authorization and review.
- Do not disable security checks simply to make a pipeline pass.

## 9. Pull Request Guidelines

A good Pull Request should:

1. Explain the problem and proposed solution.
2. Link the related issue, if one exists.
3. List the important changes.
4. Describe tests and validation performed.
5. Include screenshots or logs when useful.
6. Mention any infrastructure changes, costs, risks, or manual steps.
7. Update relevant documentation.

Keep Pull Requests focused and reasonably small. Resolve review comments before merging.

## 10. Documentation

Update the README or relevant documentation whenever a change affects:

- Architecture
- Installation or setup
- Environment variables
- Deployment procedures
- Terraform configuration
- Monitoring or troubleshooting
- Security requirements

Never document real credentials or sensitive infrastructure details.

## 11. Questions and Support

For bugs, feature requests, and questions, open a GitHub Issue and provide enough information for maintainers to understand the problem.

Thank you for helping improve the EKS GitOps CI/CD Platform!

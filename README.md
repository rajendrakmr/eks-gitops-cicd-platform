# EKS GitOps CI/CD Platform

### End-to-End CI/CD and GitOps on Amazon EKS

A cloud-native, polyglot e-commerce microservices platform demonstrating end-to-end DevOps practices using **AWS, Amazon EKS, Terraform, Docker, GitHub Actions, Argo CD, Kubernetes, Prometheus, and Grafana**.

This project uses **ShopStream**, a sample e-commerce application, to demonstrate automated build, test, security scanning, container image publishing, GitOps-based deployments, autoscaling, monitoring, and rollback workflows.

## Key Features

- **Infrastructure as Code:** Provision AWS infrastructure using reusable Terraform modules.
- **Automated CI/CD:** Build, test, scan, and publish container images using GitHub Actions.
- **GitOps Deployments:** Use Argo CD to synchronize Kubernetes manifests from Git.
- **Containerization:** Package frontend and backend microservices using Docker.
- **Kubernetes Orchestration:** Deploy services on Amazon EKS with health probes and rolling updates.
- **Autoscaling:** Configure Horizontal Pod Autoscalers based on resource utilization.
- **DevSecOps:** Integrate Trivy, dependency scanning, and static analysis into CI pipelines.
- **Monitoring and Alerting:** Collect metrics using Prometheus and visualize them through Grafana.
- **Environment Separation:** Maintain isolated development, staging, and production configurations.
- **Deployment Safety:** Support rollout validation and rollback procedures.

## Architecture

```text
                    Developer
                        |
                    Git Push / PR
                        |
                GitHub Actions CI
              /         |          \
          Tests     Security      Build
                    Scanning       Docker
                                      |
                              Container Registry
                                    (GHCR)
                                      |
                              GitOps Repository
                                      |
                                   Argo CD
                                      |
Internet --> AWS Load Balancer --> Amazon EKS
                                      |
                            Kubernetes Ingress
                                      |
                                 API Gateway
                                      |
                     +----------------+----------------+
                     |                |                |
                 Auth Service    Product Service    Order Service
                  (Node.js)          (Go)             (Python)
                     |                |                |
                 PostgreSQL        MongoDB          PostgreSQL
                     +----------------+----------------+
                                      |
                                    Redis
                                      |
                         Prometheus + Grafana
```

> The architecture is a reference design. Configure networking, database connectivity, security policies, and deployment manifests to match the actual implementation.

## Technology Stack

| Area | Technologies |
|---|---|
| Cloud | AWS, Amazon EKS, IAM, VPC, ECR or GHCR |
| Infrastructure as Code | Terraform |
| CI/CD | GitHub Actions |
| GitOps | Argo CD |
| Containers | Docker, Docker Compose |
| Orchestration | Kubernetes, Helm or Kustomize |
| Frontend | Next.js, TypeScript, Redux Toolkit, RTK Query |
| Backend | Node.js, Go, Python, FastAPI |
| Databases | PostgreSQL, MongoDB, Redis |
| Security | Trivy, SonarQube, dependency scanning, IAM |
| Monitoring | Prometheus, Grafana |
| Scripting | Bash, Python |

## CI/CD Workflow

1. Developer creates a pull request.
2. GitHub Actions runs unit tests, linting, type checks, and configuration validation.
3. Security checks scan source code, dependencies, and container images.
4. After successful validation and merge, Docker images are built and tagged with the commit SHA.
5. Images are pushed to the configured container registry.
6. The deployment configuration is updated with the new image tag.
7. Argo CD detects the Git change and synchronizes the desired state to Amazon EKS.
8. Kubernetes performs rolling updates and checks readiness.
9. Prometheus and Grafana provide visibility into application and cluster health.
10. Failed deployments trigger the configured recovery or rollback procedure.

## GitOps Deployment Model

The Git repository is the source of truth for the desired Kubernetes state.

- Application source code and deployment configuration can be maintained in separate repositories.
- Argo CD continuously reconciles the cluster with the desired Git state.
- Image tags should be immutable, preferably based on commit SHAs.
- Production changes should require review and appropriate approval gates.
- Rollback can be performed by reverting the Git configuration to a previously validated image version.

## Infrastructure with Terraform

Provision and manage the AWS infrastructure required by the platform:

- VPC, public and private subnets, and routing.
- IAM roles and policies following least privilege.
- Amazon EKS cluster and worker nodes.
- Required security groups and networking configuration.
- Container registry and supporting resources.
- Remote Terraform state with locking and access controls.

Keep environment-specific variables and state isolated between development, staging, and production. Never commit credentials or Terraform state containing sensitive values.

## Kubernetes and Reliability

The deployment manifests should support:

- CPU and memory requests and limits.
- Liveness, readiness, and startup probes where appropriate.
- Horizontal Pod Autoscaler configuration.
- Rolling updates and disruption budgets.
- Pod topology spread and appropriate replica counts.
- Network policies and non-root container execution.
- Graceful shutdown and service health validation.

Autoscaling behavior depends on resource requests, workload characteristics, cluster capacity, and metrics availability. Validate these settings through load testing.

## Monitoring and Observability

Use Prometheus and Grafana to monitor:

- Request rate, latency, and error rate.
- Pod CPU and memory utilization.
- Pod restarts and failed deployments.
- Kubernetes node and workload health.
- Application availability and saturation.

Configure actionable alert rules and validate them under controlled failure scenarios.

## Security Practices

- Use GitHub Actions OIDC to obtain AWS credentials without long-lived AWS access keys.
- Apply least-privilege IAM policies.
- Store application secrets in AWS Secrets Manager or another approved secret-management solution.
- Scan dependencies and container images before deployment.
- Use protected GitHub environments and required production approvals.
- Restrict service-to-service access using appropriate network controls.
- Avoid committing `.env` files, private keys, kubeconfig files, or real secrets.

## Repository Structure

```text
eks-gitops-cicd-platform/
├── application/
│   ├── frontend/
│   └── services/
│       ├── api-gateway/
│       ├── auth-service/
│       ├── product-service/
│       └── order-service/
├── terraform/
│   ├── modules/
│   └── environments/
│       ├── dev/
│       ├── staging/
│       └── prod/
├── k8s/
│   ├── base/
│   └── overlays/
│       ├── dev/
│       ├── staging/
│       └── prod/
├── argocd/
├── monitoring/
├── scripts/
├── docker-compose.yml
├── Makefile
└── .github/
    └── workflows/
        ├── ci.yml
        ├── security.yml
        └── release.yml
```

Adapt the structure to the files that actually exist in the repository. A separate GitOps repository is also a valid approach.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/<YOUR_GITHUB_USERNAME>/eks-gitops-cicd-platform.git
cd eks-gitops-cicd-platform
```

### 2. Run the application locally

If the application includes a working Docker Compose configuration:

```bash
make init
make up
make smoke
```

Review the Makefile and `.env.example` first; these commands depend on the implemented targets.

### 3. Provision AWS infrastructure

```bash
cd terraform/environments/dev
terraform init
terraform validate
terraform plan
```

Review the plan and estimated AWS costs before applying infrastructure.

### 4. Deploy to Amazon EKS

Configure the AWS account, cluster, container registry, IAM permissions, and GitOps repository. Install Argo CD and configure it to track the appropriate environment path.

Verify the deployment:

```bash
kubectl get nodes
kubectl get pods -A
kubectl get hpa -A
kubectl get applications -n argocd
```

These commands require the appropriate cluster access and installed components.

## Project Goals

This project demonstrates practical understanding of:

- Building repeatable cloud infrastructure with Terraform.
- Designing secure CI/CD pipelines.
- Deploying microservices to Amazon EKS.
- Implementing GitOps workflows using Argo CD.
- Improving application availability through health checks and rolling updates.
- Monitoring application performance and Kubernetes resources.
- Applying security scanning and least-privilege access controls.

## Future Improvements

- Progressive delivery using Argo Rollouts for canary and blue-green deployments.
- Automated integration and load testing.
- External Secrets Operator integration.
- OpenTelemetry distributed tracing.
- Automated disaster recovery and backup validation.
- Cost monitoring and resource optimization.

## Disclaimer

This repository is intended for learning, portfolio development, and demonstrating cloud-native DevOps patterns. AWS resources may incur charges. Review deployment configuration, security settings, and resource costs before deploying.

**Author:** [Rajendra](https://github.com/rajendrakmr)

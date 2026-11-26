variable "compartment_ocid" {
  description = "OCI Compartment OCID (typically tenancy OCID for root)"
  type        = string
}

variable "region" {
  description = "OCI Home Region (e.g., ap-hyderabad-1, ap-mumbai-1, us-ashburn-1)"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for ubuntu user (never commit private keys)"
  type        = string
}

variable "trusted_ssh_cidr" {
  description = "Restrict SSH access to your trusted IP/CIDR"
  type        = string
  default     = "0.0.0.0/0"
}

variable "free_tier_only" {
  description = "Enforce Always Free eligibility only"
  type        = bool
  default     = true
  validation {
    condition     = var.free_tier_only == true
    error_message = "SocialRelay V4 requires free_tier_only = true to block paid resource provisioning."
  }
}

variable "instance_shape" {
  type    = string
  default = "VM.Standard.A1.Flex"
  validation {
    condition     = contains(["VM.Standard.A1.Flex", "VM.Standard.E2.1.Micro"], var.instance_shape)
    error_message = "Only Always Free eligible shapes (VM.Standard.A1.Flex or VM.Standard.E2.1.Micro) are permitted."
  }
}

variable "ocpus" {
  type    = number
  default = 2
  validation {
    condition     = var.ocpus >= 1 && var.ocpus <= 4
    error_message = "Always Free Ampere A1 allows up to 4 OCPUs total across tenancy."
  }
}

variable "memory_in_gbs" {
  type    = number
  default = 12
  validation {
    condition     = var.memory_in_gbs >= 1 && var.memory_in_gbs <= 24
    error_message = "Always Free Ampere A1 allows up to 24 GB RAM total across tenancy."
  }
}

variable "boot_volume_size_in_gbs" {
  type    = number
  default = 50
  validation {
    condition     = var.boot_volume_size_in_gbs >= 50 && var.boot_volume_size_in_gbs <= 200
    error_message = "Always Free block storage allowance is up to 200 GB combined."
  }
}

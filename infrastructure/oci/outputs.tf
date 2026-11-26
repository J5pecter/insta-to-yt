output "public_ip" {
  description = "Assigned Public IPv4 address for DNS A record"
  value       = oci_core_instance.socialrelay_vm.public_ip
}

output "instance_id" {
  value = oci_core_instance.socialrelay_vm.id
}

output "shape" {
  value = oci_core_instance.socialrelay_vm.shape
}

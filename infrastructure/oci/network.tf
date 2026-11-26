resource "oci_core_vcn" "socialrelay_vcn" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "socialrelay-vcn"
  dns_label      = "socialrelay"
}

resource "oci_core_internet_gateway" "socialrelay_igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.socialrelay_vcn.id
  display_name   = "socialrelay-igw"
  enabled        = true
}

resource "oci_core_route_table" "socialrelay_rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.socialrelay_vcn.id
  display_name   = "socialrelay-rt"

  route_rules {
    network_entity_id = oci_core_internet_gateway.socialrelay_igw.id
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
  }
}

resource "oci_core_security_list" "socialrelay_sl" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.socialrelay_vcn.id
  display_name   = "socialrelay-sl"

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  # SSH (restricted)
  ingress_security_rules {
    protocol = "6"
    source   = var.trusted_ssh_cidr
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP (Caddy ACME + redirect)
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS (Caddy public TLS)
  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options {
      min = 443
      max = 443
    }
  }
}

resource "oci_core_subnet" "socialrelay_subnet" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.socialrelay_vcn.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "socialrelay-public-subnet"
  dns_label         = "srpub"
  route_table_id    = oci_core_route_table.socialrelay_rt.id
  security_list_ids = [oci_core_security_list.socialrelay_sl.id]
}

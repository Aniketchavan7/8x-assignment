"use client"

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer"
import type { ContractClause } from "@/lib/modules/portal/contract-template"

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
    lineHeight: 1.6,
  },
  header: {
    textAlign: "center",
    marginBottom: 30,
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 10,
    color: "#666",
    marginBottom: 4,
  },
  clauseSection: {
    marginBottom: 16,
  },
  clauseTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 6,
    color: "#333",
  },
  signatureSection: {
    marginTop: 40,
    borderTop: "1 solid #ddd",
    paddingTop: 20,
  },
  signatureLabel: {
    fontSize: 9,
    color: "#666",
    marginBottom: 4,
  },
  signatureValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: "center",
    fontSize: 8,
    color: "#999",
  },
})

interface ContractPDFProps {
  brandName: string
  clauses: ContractClause[]
  signerName: string | null
  signedAt: string | null
  version: string
}

export function ContractPDF({
  brandName,
  clauses,
  signerName,
  signedAt,
  version,
}: ContractPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>CREATOR SERVICES AGREEMENT</Text>
          <Text style={styles.subtitle}>
            Between 8x Social (&ldquo;Company&rdquo;) on behalf of {brandName} (&ldquo;Brand&rdquo;)
          </Text>
          <Text style={styles.subtitle}>and the undersigned Creator</Text>
        </View>

        {clauses.map((clause, i) => (
          <View key={i} style={styles.clauseSection}>
            <Text style={styles.clauseTitle}>{clause.title}</Text>
            {clause.paragraphs.map((p, j) => (
              <Text key={j} style={styles.paragraph}>
                {p}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.signatureSection}>
          {signerName ? (
            <>
              <Text style={styles.signatureLabel}>Signed by</Text>
              <Text style={styles.signatureValue}>{signerName}</Text>
              <Text style={styles.signatureLabel}>Date</Text>
              <Text style={styles.signatureValue}>
                {signedAt
                  ? new Date(signedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "—"}
              </Text>
              <Text style={styles.signatureLabel}>Version</Text>
              <Text style={styles.signatureValue}>{version}</Text>
            </>
          ) : (
            <>
              <Text style={styles.signatureLabel}>Status</Text>
              <Text style={styles.signatureValue}>Not yet signed</Text>
            </>
          )}
        </View>

        <Text style={styles.footer}>
          Creator Services Agreement v{version} — 8x Social
        </Text>
      </Page>
    </Document>
  )
}

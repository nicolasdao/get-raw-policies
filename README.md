# get-raw-policies

```
npx 
```

List all the AWS managed policies. Requires that the AWS CLI is installed and that the current default profile is logged in. Behind this scene, the package executes the following commands:

List all the AWS managed policies:
```
aws iam list-policies --scope AWS
```

Gets a policy's document's details (i.e., Action, Effect, Resource):
```
aws iam get-policy-version --policy-arn ${arn} --version-id ${versionId}
```

To 